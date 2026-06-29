# Building EchoFind: Architecture and Audio Processing Flow

This document is a deep dive into how I built EchoFind's architecture. I'll walk you through the complete lifecycle of audio processing, from the moment you upload a file all the way to the semantic search and retrieval phases. I'll also cover my deployment strategy and some of the engineering headaches I had to solve along the way. I've tried to keep the explanations accessible by breaking down the technical jargon as we go.

---

## 1. System Overview

I built EchoFind as a full-stack semantic audio search engine. **Semantic Audio Search** is a method that actually understands the *meaning* of an audio clip, rather than just matching file names or manual tags. For example, it understands that an audio clip sounds like "a dog barking" without anyone having to manually label it. It can identify and isolate specific environmental sounds or spoken words hidden deep inside lengthy audio files. I bridged the gap between acoustic semantic understanding and natural language queries using a dual-pipeline architecture.

Here is how I set it up:
* **Semantic Acoustic Search** is powered by the **LAION-CLAP** model. CLAP is a neural network model trained on massive amounts of audio and text pairs. It learns to map both an audio clip (like the sound of a siren) and text (like the word "siren") into the exact same mathematical space. This allows my system to find audio that matches a text description.
* **Speech-to-Text Transcription** is powered by **faster-whisper**, which is an optimized version of OpenAI's Whisper model. Whisper is an AI model designed to listen to spoken audio and transcribe it into text. I chose "faster-whisper" because it does this much faster and uses way less computer memory than the original model.

For the backend, I built it with **FastAPI**, a modern and lightning-fast web framework for building APIs with Python. It relies heavily on **PostgreSQL**, an advanced open-source relational database. I extended PostgreSQL with two plugins: `pgvector` and `pg_trgm`. These plugins are what enable my hybrid vector and full-text search capabilities.

![System Overview](/images/system_overview.png)

---

## 2. The Audio Processing Pipeline

When you upload an audio file to EchoFind, I send it through a complex multi-stage processing pipeline that I designed for speed, accuracy, and high-resolution temporal localization (finding exactly *when* something happens).

### Phase 1: Upload and Initialization
1. **File Ingestion**: The audio file comes in via a web request and I save it to a local folder.
2. **Job Tracking**: I immediately create a record in the PostgreSQL database with a status of `queued`.
3. **Background Execution**: I have FastAPI spawn a background task to process the audio so your web request can finish immediately. This allows the user interface to quickly start polling for progress updates rather than freezing while the file is processed.

### Phase 2: Audio Fragmentation
To pinpoint exactly *when* a sound occurs, I realized the audio cannot be analyzed as a single monolithic file.
* I programmed the system to segment the raw audio into overlapping chunks of varying lengths (resolutions) using 1-second, 2-second, and onset-detected intervals (which detect sharp sudden increases in volume).
* This cross-resolution approach is critical. Longer chunks provide better acoustic context for the CLAP model, while shorter chunks allow for precise timing.

### Phase 3: Concurrent Processing (Embedding & Transcription)
I wrote a method to run the acoustic analysis and speech transcription in parallel. This significantly reduces the total processing time.

#### 3A. Semantic Acoustic Embedding (CLAP)
* **Model**: I use the CLAP model wrapped in a thread-safe system.
* **Batch Processing**: The fragmented audio chunks are batched into groups of 128.
* **Embedding / Vectorization**: Each chunk is passed through the model and converted into a **vector**, which is just a long list of 512 numbers. You can think of a vector as a set of coordinates in a 512-dimensional space. Audio clips that sound similar will have coordinates that are close to each other. I then L2-normalize these vectors (adjusting them mathematically to a standard scale) to optimize them for comparing similarity later.
* **Storage**: I insert the vectors into the database as `pgvector` types (a special format enabled by the database plugin to store and search mathematical vectors) alongside their start and end times.

#### 3B. Word-Level Transcription (Whisper)
* **Model**: I run `faster-whisper` using **int8 quantization**. Quantization is a technique to make AI models smaller and faster by rounding highly precise decimal numbers to less precise whole numbers (like 8-bit integers). This uses drastically less computer memory with very little loss in accuracy.
* **VAD & Timestamps**: I run the model with **VAD (Voice Activity Detection)** enabled. VAD detects when human speech is happening versus when there is silence or background noise. This lets the model skip the silent parts and save time. I then extract the exact start and end timestamps for every spoken word.
* **Storage**: The exact timestamps and text for every spoken word are saved directly into the database.

![Audio Processing Pipeline](/images/processing_pipeline.png)

---

## 3. The Hybrid Search Engine

When you submit a text query, I orchestrated a sophisticated hybrid search that blends traditional text search with state-of-the-art vector similarity.

### Step 1: Speech Extraction and Full-Text Search
* **Query Cleaning**: My system intercepts conversational queries (like "sound of a person saying hello") and strips the prefix to isolate the target word ("hello").
* **FTS (Full-Text Search)**: I query the database using PostgreSQL's Full-Text Search feature. This is designed to search through large amounts of text efficiently while understanding language rules like plurals (so searching for "run" will also find "running").
* **Trigram Similarity**: If exact word matches aren't found, I have it fall back to fuzzy matching using the **`pg_trgm`** plugin. This breaks words into groups of three letters (trigrams) to find "fuzzy" matches, which compensates for slight spelling mistakes or variations in the transcribed text.

### Step 2: Query Ensemble Expansion
* **Phrasing Diversity**: The CLAP text encoder is very sensitive to how things are phrased. To fix this, I have EchoFind expand a query like "barking" into an ensemble of 7 variations (like "This is a sound of barking" and "A recording of barking").
* **Weighted Averaging**: I convert all text variations into vectors. The vector for the original user query is given a 2x weight, and I average all the vectors together to create a highly robust, discriminative master query vector.

### Step 3: Vector Similarity Retrieval
* **ANN (Approximate Nearest Neighbor)**: Searching through millions of vectors to find the closest match one-by-one is way too slow. Instead, I issue an ANN query, which takes strategic shortcuts to find the *approximate* best matches incredibly quickly.
* **Cosine Distance**: This query uses **Cosine Distance**, a mathematical formula that looks at the angle between two vectors in space to measure similarity. If the angle is very small, the text query and the audio clip are highly related. The database quickly fetches the top 1000 acoustically similar audio chunks.

### Step 4: Temporal Reranking and Non-Maximum Suppression (NMS)
* **Thresholding**: I aggressively filter the candidates using distance thresholds that I tuned specifically for different chunk sizes to reject false positives.
* **NMS (Non-Maximum Suppression)**: Because the audio was cut into overlapping chunks, a single "dog bark" might be detected in three overlapping segments. NMS is a filtering technique I use to look at these overlaps, keep the one with the highest score, and suppress (delete) the redundant neighboring chunks. This ensures the final results I show you are isolated, distinct highlights.

![Hybrid Search Engine](/images/hybrid_search.png)

---

## 4. Deployment Architecture

I deployed EchoFind using **Docker**. Docker is a technology that packages software into standardized units called containers. A container includes everything the software needs to run, like the code, runtime, and tools. This ensures EchoFind runs exactly the same way on my computer as it does on the server, making deployment scalable and reproducible. The architecture I built consists of three primary services:

![Deployment Architecture](/images/deployment_architecture.png)

### 1. Database (db)
* I use a PostgreSQL container pre-loaded with the `pgvector` plugin.
* This serves as my single source of truth for relational metadata, job state tracking, word-level transcripts, and 512-dimensional acoustic vectors.
* I use persistent storage volumes to ensure vector indices and audio metadata survive even if the container is restarted.

### 2. Backend (backend)
* This is a Python FastAPI container running on **Uvicorn**, which is a lightning-fast server implementation for Python that handles the raw web traffic and network connections.
* It manages file saving, runs the machine learning models in memory, and handles all HTTP API requests.

### 3. Frontend (frontend)
* This is a Node.js container running Next.js and React.
* It interacts with the backend via web APIs to upload files, poll job statuses, and visualize the audio chunks and transcripts.

---

## 5. Technical Complexities and Engineering Challenges

Building EchoFind required me to solve several advanced engineering problems related to concurrency, memory management, and signal processing.

### Concurrency and Deadlocks
* **Tokenizers**: Before feeding text into an AI model, a **tokenizer** breaks down human sentences into smaller pieces (tokens) that the AI can digest mathematically. I found out the hard way that running the CLAP tokenizer inside a multi-threaded web server environment can cause severe deadlocks (where the program completely freezes) if the tokenizer attempts to spawn its own sub-processes. I mitigated this by explicitly disabling tokenizer parallelism.
* **Thread Pools**: To prevent the heavy ML models from blocking the web server and causing it to stop responding to other users, I offloaded the intensive CLAP and Whisper calculations to a separate pool of background worker threads.

### Hardware and Memory Constraints
* **MPS Memory Bugs**: **MPS** (Metal Performance Shaders) is Apple's technology for running complex mathematical calculations on the graphics chip of Apple Silicon computers. While it is very fast, I noticed it is notorious for memory allocation bugs with certain PyTorch transformer architectures like CLAP. I had to write custom logic to carefully handle device placement, falling back to the standard CPU when necessary to avoid crashes.
* **OOM (Out of Memory) Prevention**: An OOM error is a critical failure that occurs when a program tries to use more RAM than the system has available, causing the operating system to forcefully kill the program. By utilizing `int8` quantization for Whisper, I drastically reduced the RAM footprint. This allows both Whisper and the CLAP model to reside in memory simultaneously without triggering an OOM kill.

### Cross-Resolution Thresholding
* **Semantic Variability**: A 1-second audio chunk contains significantly less semantic information than a 5-second chunk, which inherently affects its vector distance to a text prompt.
* **Dynamic Scoring**: I implemented a dynamic scoring and thresholding system. It actively penalizes or rewards chunks based on their resolution to ensure short, snappy sound events (like a door slam) can compete fairly with long, ambient sounds (like rain) during the ranking phase.

---

## 6. Frequently Asked Questions (FAQ)

### What formats of audio files are supported?
I configured EchoFind to support most common audio formats including `.wav`, `.mp3`, `.flac`, and `.ogg`. When you upload an unsupported or corrupted file, the backend will catch it and return a helpful validation error.

### Do I need to provide text transcripts for my audio?
**No.** I use the LAION-CLAP model to "listen" to the audio directly. If you search for "a dog barking", it finds the acoustic pattern of a bark rather than relying on a text label that says "dog barking".

### How fast is the Approximate Nearest Neighbor (ANN) search?
Because I indexed the vectors using HNSW (Hierarchical Navigable Small World) graphs in PostgreSQL, retrieving the top 1000 acoustic matches from a database of millions takes less than 10 milliseconds.

### Does the system work on CPU?
Yes. I specifically designed the entire stack, including the Neural Networks, to run efficiently on standard CPUs. I utilized `faster-whisper` with `int8` quantization to drastically reduce memory usage, allowing it to run smoothly without triggering Out-Of-Memory errors.

**Why CPU instead of GPU?**  
I am currently running it on a CPU-only architecture primarily due to hosting costs. Cloud providers like Hugging Face charge approximately 10x more for their cheapest GPU tier compared to a standard 8-core CPU environment. 

However, migrating the backend to a dedicated NVIDIA GPU (utilizing CUDA and `float16` precision) is my long-term objective. Moving to a GPU would remove the need for extreme model quantization and speed up the audio ingestion pipeline by an order of magnitude.
