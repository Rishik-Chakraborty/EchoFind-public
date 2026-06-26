# EchoFind

The **EchoFind** project is a high-frequency neural audio retrieval system and temporal spatial search indexer. Its core objective is to solve the limitation of traditional text-based search engines, which rely on speech-to-text transcriptions and discard acoustic context.

Unlike traditional systems that sanitize the acoustic landscape of a file, EchoFind maps native waveforms—tracking pitch, timbre, rhythm, and structural sound distributions—directly into a spatial geometric coordinate system ($D = 512$) using Multi-Modal Contrastive Learning (specifically the LAION-CLAP transformer model). This allows users to perform semantic "Control + F" operations across unstructured audio to find not just spoken words, but raw sonic signatures (e.g., glass shattering, background sirens, mechanical grinding, or emotional shifts).

## System Architecture & Technical Design

EchoFind operates a multi-modal, hybrid-search backend architecture combining traditional Full-Text Search (FTS) with Vector-based Acoustic Nearest Neighbor Search. The backend is built on **FastAPI**, backed by **PostgreSQL** (with `pgvector` and `pg_trgm` extensions).

### 1. Ingestion & DSP Pipeline
Raw files are ingested via FastAPI and processed asynchronously in the background. The **Digital Signal Processing (DSP) Layer** uses `librosa` to execute a **Multi-Resolution Chunking Engine**.
- **Dynamic Onset Segmentation:** Instead of an exhaustive dense temporal grid, the system uses Librosa's onset detection to identify transient acoustic events. It extracts precise 500ms chunks (-100ms to +400ms around the onset, capped at 50 onsets per file) to capture sharp sounds.
- **Localized Speech (2s Tiers):** For continuous sounds and speech, the audio is segmented into 2-second chunks with 0% overlap.
- **Silence Pruning & Normalization:** Chunks with RMS energy below -60.0 dB are aggressively pruned to prevent vector space pollution. Peak-normalization to [-1, 1] ensures embeddings remain consistent across varying recording volumes.

### 2. Multi-Modal Indexing
The system processes audio through a dual-pipeline approach to index both its acoustic and semantic properties:
- **Acoustic Neural Processing:** Valid audio chunks are batched and processed by the **LAION-CLAP foundation model**, which extracts structural textures and outputs 512-dimensional vector arrays. These embeddings are stored in PostgreSQL using the `pgvector` extension.
- **Transcriptive Processing:** In parallel, the audio is transcribed using **Faster-Whisper (INT8 quantized base model)** to extract word-level timestamps. These transcripts are inserted into the `audio_transcripts` table and indexed using PostgreSQL `gin (to_tsvector)` for exact keyword matching and `gin_trgm_ops` for fuzzy trigram similarity.

### 3. Query Optimization & Retrieval
EchoFind employs an advanced retrieval pipeline to handle complex natural language and audio-to-audio queries.
- **Query Ensemble & Expansion:** For text queries, the system generates an ensemble of up to 7 phrasings (e.g., "The sound of {query}", "A recording of {query}"). These are embedded via CLAP, with the original text weighted 2x, and averaged to form a highly robust, discriminative query vector.
- **Hybrid Search Execution:** 
  1. The query text is scrubbed for speech prefixes (e.g., "sound of a person saying") and first run against the PostgreSQL full-text search index (with a `pg_trgm` fallback) to catch exact spoken words, ranking these at the top of the search results.
  2. Simultaneously, a cosine distance calculation (`<=>`) via `pgvector` retrieves the top 1000 acoustic candidates that match the ensemble query vector.
- **Temporal Attention Reranking & NMS:** Acoustic candidates are strictly filtered via absolute distance thresholds specific to their resolution tier (e.g., 0.72 for onsets, 0.75 for 2s chunks). Finally, **Non-Maximum Suppression (NMS)** is applied to prevent overlapping highlight events, returning precise, isolated temporal hits (Top-20).

### 4. Corpus Mapping (Dimensionality Reduction)
To visualize the unstructured audio landscape, the backend implements a `/api/v1/corpus/map` endpoint. It fetches embeddings from the vector database, applies **Principal Component Analysis (PCA)** via `scikit-learn` to reduce the 512D space down to 3D, and runs **K-Means clustering** ($k=5$). It also calculates 95th-percentile distances from cluster centers to flag acoustic outliers for the user interface.

## How to Build & Run

1. **Infrastructure & Database Initialization:** 
   Use `docker-compose` to boot a PostgreSQL instance equipped with the `pgvector` extension. Ensure database schemas and extensions (`pg_trgm`) are initialized upon startup.
2. **Backend Services:**
   Install backend requirements (e.g., `faster-whisper`, `librosa`, `torch`, `fastapi`, `SQLAlchemy`, `scikit-learn`). Start the FastAPI server using `uvicorn src.main:app --reload`. 
3. **Frontend Visualization:** 
   Connect a React/Next.js or Vanilla UI dashboard to the API to submit jobs, poll indexing progress, query search results, and map highlights onto an HTML5 audio playback timeline.