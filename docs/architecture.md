# EchoFind Architecture and Audio Processing Flow

This document provides an in-depth, technical exploration of EchoFind's architecture. It details the complete lifecycle of audio processing—from the moment a file is uploaded to the semantic search and retrieval phases—along with the deployment strategy and the complex engineering challenges that EchoFind solves.

---

## 1. System Overview

EchoFind is a full-stack, semantic audio search engine capable of identifying and isolating specific environmental sounds or spoken words within lengthy audio files. The system bridges the gap between acoustic semantic understanding and natural language queries using a dual-pipeline architecture:
- **Semantic Acoustic Search** powered by the **LAION-CLAP** (Contrastive Language-Audio Pretraining) model.
- **Speech-to-Text Transcription** powered by **faster-whisper**.

The backend is built with **FastAPI** (Python) and relies heavily on **PostgreSQL** (with the `pgvector` and `pg_trgm` extensions) for hybrid vector and full-text search.

---

## 2. The Audio Processing Pipeline

When a user uploads an audio file to EchoFind, it undergoes a complex, multi-stage processing pipeline designed for speed, accuracy, and high-resolution temporal localization.

### Phase 1: Upload and Initialization
1. **File Ingestion**: The audio file is received via a `POST /api/v1/upload` endpoint and saved to a local `uploads/` directory.
2. **Job Tracking**: A record is immediately created in the `audio_jobs` PostgreSQL table with a status of `queued`.
3. **Background Execution**: FastAPI's `BackgroundTasks` spawns the `process_upload` task so the HTTP request can return immediately with a job ID, allowing the frontend to poll for progress.

### Phase 2: Audio Fragmentation
To pinpoint exactly *when* a sound occurs, the audio cannot be embedded as a single monolithic file.
- The `AudioFragmenter` segments the raw audio into overlapping chunks of varying resolutions. 
- **Multi-Resolution Strategy**: Chunks are generated at 1-second, 2-second, and onset-detected intervals. 
- This cross-resolution approach is critical. Longer chunks (e.g., 2s) provide better acoustic context for the CLAP model, while shorter or onset-based chunks allow for precise temporal localization.

### Phase 3: Concurrent Processing (Embedding & Transcription)
EchoFind employs a `ThreadPoolExecutor` to run the acoustic embedding and speech transcription in parallel. This significantly reduces the total processing time.

#### 3A. Semantic Acoustic Embedding (CLAP)
- **Model**: EchoFind uses the `laion/clap-htsat-fused` model, wrapped in a thread-safe `ClapEmbedder` singleton.
- **Batch Processing**: The fragmented audio chunks are batched into groups of 128.
- **Vectorization**: Each batch is processed into a 512-dimensional vector. These vectors are L2-normalized to the unit sphere to optimize them for cosine similarity comparisons.
- **Storage**: The vectors are inserted into the `audio_chunks` table as `pgvector` types alongside their temporal metadata (start and end times).

#### 3B. Word-Level Transcription (Whisper)
- **Model**: Uses `faster-whisper` (specifically the `tiny` model running in `int8` precision on the CPU) to extract text.
- **VAD & Timestamps**: The model runs with Voice Activity Detection (VAD) filtering enabled and extracts word-level timestamps.
- **Storage**: The exact start time, end time, and text for every spoken word are inserted into the `audio_transcripts` table.

---

## 3. The Hybrid Search Engine

When a user submits a text query, EchoFind orchestrates a sophisticated hybrid search, blending traditional text search with state-of-the-art vector similarity.

### Step 1: Speech Extraction and Full-Text Search
- **Query Cleaning**: The system intercepts common conversational queries (e.g., "sound of a person saying hello") and strips the prefix to isolate the target word ("hello").
- **FTS and Trigram**: It queries the `audio_transcripts` table using PostgreSQL's Full-Text Search (`to_tsvector` / `tsquery`). If exact word matches aren't found, it falls back to fuzzy matching using trigram similarity (`pg_trgm`).

### Step 2: Query Ensemble Expansion
- **Phrasing Diversity**: The CLAP text encoder is sensitive to phrasing. EchoFind expands a query like "barking" into an ensemble of 7 variations (e.g., "This is a sound of barking", "A recording of barking").
- **Weighted Averaging**: All variations are embedded into vectors. The vector for the original query is given a 2x weight, and all vectors are averaged to create a highly robust, discriminative query vector.

### Step 3: Vector Similarity Retrieval
- **pgvector**: The backend issues an Approximate Nearest Neighbor (ANN) query using the `<=>` (cosine distance) operator in `pgvector` to fetch the top 1000 acoustically similar audio chunks.

### Step 4: Temporal Reranking and Non-Maximum Suppression (NMS)
- **Thresholding**: Candidates are aggressively filtered using absolute distance thresholds specifically tuned for different resolution types (e.g., 0.72 for onset chunks, 0.75 for 1s chunks) to reject false positives.
- **NMS**: Because the audio was chunked with heavy overlap, multiple overlapping chunks might match the query. EchoFind applies a 1D Non-Maximum Suppression algorithm to suppress overlapping candidates, ensuring the final results are isolated, distinct highlights.

---

## 4. Deployment Architecture

EchoFind is containerized using Docker, making deployment scalable and reproducible. The architecture is defined in `docker-compose.yml` and consists of three primary services:

### 1. Database (`db`)
- Uses the `ankane/pgvector:latest` image.
- Serves as the single source of truth for relational metadata, job state tracking, word-level transcripts, and 512-dimensional acoustic vectors.
- Uses persistent Docker volumes (`pgdata`) to ensure vector indices and audio metadata survive container restarts.

### 2. Backend (`backend`)
- A Python FastAPI container.
- Manages file I/O (saving uploads to a shared or local volume), runs the machine learning models (CLAP and Whisper) in memory, and handles all HTTP API requests.
- Integrates tightly with the DB service for querying and updating job progress.

### 3. Frontend (`frontend`)
- A Node.js container (e.g., Next.js/React) running on port 3000.
- Interacts with the backend via RESTful APIs to upload files, poll job statuses, and visualize the audio chunks and transcripts.

---

## 5. Technical Complexities and Engineering Challenges

Building EchoFind required solving several advanced engineering problems related to concurrency, memory management, and signal processing.

### Concurrency and Deadlocks
- **HuggingFace Tokenizers**: Running the CLAP tokenizer inside a multi-threaded Uvicorn environment can cause severe deadlocks if the tokenizer attempts to spawn its own sub-processes. EchoFind mitigates this by explicitly setting `TOKENIZERS_PARALLELISM=false`.
- **Thread Pools**: FastAPI runs background tasks in the main event loop. To prevent the heavy ML models from blocking the web server, the `process_upload` function uses a `ThreadPoolExecutor` to offload the CPU-bound CLAP and Whisper inference.

### Hardware and Memory Constraints
- **MPS Memory Bugs**: While Apple Silicon (MPS) offers great acceleration, it is notorious for memory allocation bugs with certain PyTorch transformer architectures like CLAP. EchoFind includes logic to carefully handle device placement (`mps` vs `cpu`).
- **Quantization**: `faster-whisper` is executed with `compute_type="int8"`. This drastically reduces the RAM footprint, allowing both Whisper and the CLAP model to reside in memory simultaneously without causing OOM (Out of Memory) kills.

### Cross-Resolution Thresholding
- **Semantic Variability**: A 1-second audio chunk contains significantly less semantic information than a 5-second chunk, which inherently affects its vector distance to a text prompt.
- **Dynamic Scoring**: EchoFind implements a dynamic scoring and thresholding system (`_RESOLUTION_WEIGHTS` and `_ABSOLUTE_THRESHOLDS`). It actively penalizes or rewards chunks based on their resolution to ensure short, snappy sound events (like a door slam) can compete fairly with long, ambient sounds (like rain) during the ranking phase.
