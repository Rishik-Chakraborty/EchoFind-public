# EchoFind Architecture and Audio Processing Flow

This document provides an in-depth, technical exploration of EchoFind's architecture. It details the complete lifecycle of audio processing—from the moment a file is uploaded to the semantic search and retrieval phases—along with the deployment strategy and the complex engineering challenges that EchoFind solves. The explanations are written to be accessible, breaking down technical jargon as it is introduced.

---

## 1. System Overview

EchoFind is a full-stack, semantic audio search engine. **Semantic Audio Search** is a search method that understands the *meaning* (semantics) of an audio clip rather than just matching file names or manual tags. For example, it understands that an audio clip sounds like "a dog barking" without anyone manually labeling it as such. It can identify and isolate specific environmental sounds or spoken words within lengthy audio files. The system bridges the gap between acoustic semantic understanding and natural language queries using a dual-pipeline architecture:

- **Semantic Acoustic Search** powered by the **LAION-CLAP (Contrastive Language-Audio Pretraining)** model. CLAP is a neural network model trained on massive amounts of audio and text pairs. It learns to map both an audio clip (e.g., the sound of a siren) and text (e.g., the word "siren") into the same mathematical space, allowing the system to find audio that matches a text description.
- **Speech-to-Text Transcription** powered by **faster-whisper**, an optimized version of OpenAI's "Whisper" model. Whisper is an Artificial Intelligence model designed to listen to spoken audio and transcribe it into text. "faster-whisper" does this much faster and uses less computer memory than the original model.

The backend is built with **FastAPI** (a modern, lightning-fast web framework for building APIs with Python) and relies heavily on **PostgreSQL** (a highly advanced, open-source relational database). PostgreSQL is extended with two plugins: `pgvector` and `pg_trgm`, which enable hybrid vector and full-text search capabilities.

![System Overview](/images/system_overview.png)
---

## 2. The Audio Processing Pipeline

When a user uploads an audio file to EchoFind, it undergoes a complex, multi-stage processing pipeline designed for speed, accuracy, and high-resolution temporal localization (finding exactly *when* something happens).

### Phase 1: Upload and Initialization
1. **File Ingestion**: The audio file is received via a web request and saved to a local folder.
2. **Job Tracking**: A record is immediately created in the PostgreSQL database with a status of `queued`.
3. **Background Execution**: FastAPI spawns a background task to process the audio so the user's web request can finish immediately. This allows the user interface to quickly start polling for progress updates rather than freezing while the file is processed.

### Phase 2: Audio Fragmentation
To pinpoint exactly *when* a sound occurs, the audio cannot be analyzed as a single monolithic file.
- The system segments the raw audio into overlapping chunks of varying lengths (resolutions) using 1-second, 2-second, and onset-detected intervals (detecting sharp, sudden increases in volume). 
- This cross-resolution approach is critical. Longer chunks provide better acoustic context for the CLAP model, while shorter chunks allow for precise timing.

### Phase 3: Concurrent Processing (Embedding & Transcription)
EchoFind employs a method to run the acoustic analysis and speech transcription in parallel (concurrently). This significantly reduces the total processing time.

#### 3A. Semantic Acoustic Embedding (CLAP)
- **Model**: EchoFind uses the CLAP model wrapped in a thread-safe system.
- **Batch Processing**: The fragmented audio chunks are batched into groups of 128.
- **Embedding / Vectorization**: Each chunk is passed through the model and converted into a **vector**—a long list of 512 numbers. You can think of a vector as a set of coordinates in a 512-dimensional space. Audio clips that sound similar will have coordinates that are close to each other. These vectors are L2-normalized (adjusted mathematically to a standard scale) to optimize them for comparing similarity later.
- **Storage**: The vectors are inserted into the database as `pgvector` types (a special format enabled by the database plugin to store and search mathematical vectors) alongside their start and end times.

#### 3B. Word-Level Transcription (Whisper)
- **Model**: Uses `faster-whisper` running in **int8 quantization**. Quantization is a technique to make AI models smaller and faster by rounding highly precise decimal numbers to less precise whole numbers (8-bit integers, or `int8`). This uses drastically less computer memory with very little loss in accuracy.
- **VAD & Timestamps**: The model runs with **VAD (Voice Activity Detection)** enabled. VAD detects when human speech is happening versus when there is silence or background noise, allowing the model to skip the silent parts and save time. The model then extracts exact start and end timestamps for every spoken word.
- **Storage**: The exact timestamps and text for every spoken word are saved into the database.

![Audio Processing Pipeline](/images/processing_pipeline.png)
---

## 3. The Hybrid Search Engine

When a user submits a text query, EchoFind orchestrates a sophisticated hybrid search, blending traditional text search with state-of-the-art vector similarity.

### Step 1: Speech Extraction and Full-Text Search
- **Query Cleaning**: The system intercepts conversational queries (e.g., "sound of a person saying hello") and strips the prefix to isolate the target word ("hello").
- **FTS (Full-Text Search)**: It queries the database using PostgreSQL's Full-Text Search feature, which is designed to search through large amounts of text efficiently while understanding language rules like plurals (e.g., searching for "run" will also find "running"). 
- **Trigram Similarity**: If exact word matches aren't found, it falls back to fuzzy matching using the **`pg_trgm`** plugin. This breaks words into groups of three letters (trigrams) to find "fuzzy" matches, compensating for slight spelling mistakes or variations in the transcribed text.

### Step 2: Query Ensemble Expansion
- **Phrasing Diversity**: The CLAP text encoder is sensitive to how things are phrased. EchoFind expands a query like "barking" into an ensemble of 7 variations (e.g., "This is a sound of barking", "A recording of barking").
- **Weighted Averaging**: All text variations are converted into vectors. The vector for the original user query is given a 2x weight, and all vectors are averaged to create a highly robust, discriminative master query vector.

### Step 3: Vector Similarity Retrieval
- **ANN (Approximate Nearest Neighbor)**: Searching through millions of vectors to find the closest match one-by-one is too slow. The backend issues an ANN query—which takes strategic shortcuts to find the *approximate* best matches incredibly quickly.
- **Cosine Distance**: This query uses **Cosine Distance (`<=>`)**, a mathematical formula that looks at the angle between two vectors in space to measure similarity. If the angle is very small, the text query and the audio clip are highly related. The database fetches the top 1000 acoustically similar audio chunks.

### Step 4: Temporal Reranking and Non-Maximum Suppression (NMS)
- **Thresholding**: Candidates are aggressively filtered using distance thresholds tuned for different chunk sizes to reject false positives.
- **NMS (Non-Maximum Suppression)**: Because the audio was cut into overlapping chunks, a single "dog bark" might be detected in three overlapping segments. NMS is a filtering technique that looks at these overlaps, keeps the one with the highest score (the "Maximum"), and suppresses (deletes) the redundant neighboring chunks. This ensures the final results are isolated, distinct highlights.

![Hybrid Search Engine](/images/hybrid_search.png)
---

## 4. Deployment Architecture

EchoFind is deployed using **Docker / Containerization**. Docker is a technology that packages software into standardized units called "containers." A container includes everything the software needs to run (code, runtime, tools). This ensures EchoFind runs exactly the same way on any computer, making deployment scalable and reproducible. The architecture consists of three primary services:

![Deployment Architecture](/images/deployment_architecture.png)

### 1. Database (`db`)
- Uses a PostgreSQL container pre-loaded with the `pgvector` plugin.
- Serves as the single source of truth for relational metadata, job state tracking, word-level transcripts, and 512-dimensional acoustic vectors.
- Uses persistent storage volumes to ensure vector indices and audio metadata survive even if the container is restarted.

### 2. Backend (`backend`)
- A Python FastAPI container running on **Uvicorn** (a lightning-fast server implementation for Python that handles the raw web traffic and network connections).
- Manages file saving, runs the machine learning models in memory, and handles all HTTP API requests.

### 3. Frontend (`frontend`)
- A Node.js container (Next.js/React).
- Interacts with the backend via web APIs to upload files, poll job statuses, and visualize the audio chunks and transcripts.

---

## 5. Technical Complexities and Engineering Challenges

Building EchoFind required solving several advanced engineering problems related to concurrency, memory management, and signal processing.

### Concurrency and Deadlocks
- **Tokenizers**: Before feeding text into an AI model, a **tokenizer** breaks down human sentences into smaller pieces (tokens) that the AI can digest mathematically. Running the CLAP tokenizer inside a multi-threaded web server environment can cause severe deadlocks (where the program completely freezes) if the tokenizer attempts to spawn its own sub-processes. EchoFind mitigates this by explicitly disabling tokenizer parallelism.
- **Thread Pools**: To prevent the heavy ML models from blocking the web server and causing it to stop responding to other users, the system offloads the intensive CLAP and Whisper calculations to a separate pool of background worker threads.

### Hardware and Memory Constraints
- **MPS Memory Bugs**: **MPS (Metal Performance Shaders)** is Apple's technology for running complex mathematical calculations on the graphics chip (GPU) of Apple Silicon computers (like M1/M2 Macs). While very fast, it is notorious for memory allocation bugs with certain PyTorch transformer architectures like CLAP. EchoFind includes logic to carefully handle device placement, falling back to the standard CPU when necessary to avoid crashes.
- **OOM (Out of Memory) Prevention**: An OOM error is a critical failure that occurs when a program tries to use more RAM than the system has available, causing the operating system to forcefully kill the program. By utilizing `int8` quantization for Whisper, the RAM footprint is drastically reduced, allowing both Whisper and the CLAP model to reside in memory simultaneously without triggering an OOM kill.

### Cross-Resolution Thresholding
- **Semantic Variability**: A 1-second audio chunk contains significantly less semantic information than a 5-second chunk, which inherently affects its vector distance to a text prompt.
- **Dynamic Scoring**: EchoFind implements a dynamic scoring and thresholding system. It actively penalizes or rewards chunks based on their resolution to ensure short, snappy sound events (like a door slam) can compete fairly with long, ambient sounds (like rain) during the ranking phase.

---

## 6. Frequently Asked Questions (FAQ)

### What formats of audio files are supported?
EchoFind supports most common audio formats including `.wav`, `.mp3`, `.flac`, and `.ogg`. When an unsupported or corrupted file is uploaded, the backend will return a helpful validation error.

### Do I need to provide text transcripts for my audio?
**No.** EchoFind uses the LAION-CLAP model to "listen" to the audio directly. If you search for "a dog barking," it finds the acoustic pattern of a bark, not a text label that says "dog barking."

### How fast is the Approximate Nearest Neighbor (ANN) search?
Because the vectors are indexed using HNSW (Hierarchical Navigable Small World) graphs in PostgreSQL, retrieving the top 1000 acoustic matches from a database of millions takes less than 10 milliseconds.

### Does the system work on CPU?
Yes. The entire stack, including the Neural Networks, is designed to run efficiently on standard CPUs. We utilize `faster-whisper` with `int8` quantization to drastically reduce memory usage, allowing it to run smoothly on a Hugging Face Space or a standard laptop.
