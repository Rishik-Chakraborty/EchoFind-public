# EchoFind

The **EchoFind** project is a high-frequency neural audio retrieval system and temporal spatial search indexer. Its core objective is to solve the limitation of traditional text-based search engines, which rely on speech-to-text transcriptions and discard acoustic context.

Unlike Whisper-based systems that sanitize the acoustic landscape of a file, EchoFind maps native waveforms—tracking pitch, timbre, rhythm, and structural sound distributions—directly into a spatial geometric coordinate system ($D = 512$) using Multi-Modal Contrastive Learning (specifically the LAION-CLAP transformer model). This allows users to perform semantic "Control + F" operations across unstructured audio to find not just spoken words, but raw sonic signatures (e.g., glass shattering, background sirens, mechanical grinding, or emotional shifts).

### Key Technical Infrastructure (v3.0)

EchoFind utilizes a streamlined AWS-native architecture designed for high availability and fault tolerance.

* **Ingestion & DSP Layer:** Raw files are uploaded to Amazon S3, triggering an AWS SQS queue to decouple heavy processing tasks. An ECS Fargate worker (CPU) intercepts the audio and executes a **Multi-Resolution Chunking Engine**, which extracts overlapping matrices at three distinct temporal resolutions: 250ms (transients), 2s (localized speech), and 5s (contextual soundscapes).

* **Neural Processing:** These preprocessed matrices are batched and sent to a Dedicated GPU Inference Container on AWS EC2, where the LAION-CLAP foundation model extracts structural textures and exports 512-dimensional vector arrays.

* **Vector Database:** Embeddings are written to AWS RDS PostgreSQL with the `pgvector` extension, utilizing an HNSW (Hierarchical Navigable Small World) index for low-latency cosine distance calculations.

* **Query Optimization:** To optimize retrieval, a Redis cache stores pre-computed 512D vectors for frequently searched terms, bypassing the 80ms CLAP text-encoder inference cost. Furthermore, retrieval is enhanced via **Temporal Attention Reranking**, which ensures that continuous events (e.g., an 8-second siren) are ranked higher than short anomalous spikes.

* **Real-Time Streaming:** The system supports a parallel streaming pipeline (WebSockets) where a user can leave a microphone running and query an actively updating acoustic index without blocking the main web server.

### Performance Expectations

* **Indexing (Raw Upload):** Processing a 2-hour file on consumer hardware takes roughly 10 to 25 minutes, depending on CPU/GPU availability.

* **Search Latency:** While the database nearest-neighbor retrieval executes in $<15\text{ ms}$, the true end-to-end semantic search latency averages ~100ms to 150ms.

### How to Build It: A Sequential Strategy

To ensure success, treat this as a multi-phase engineering project.

1. **Infrastructure & Database Initialization:** Use `docker-compose` to boot a FastAPI service and PostgreSQL with `pgvector`. Define your schemas for `audio_catalogs` and `audio_vectors`.

2. **DSP Pipeline:** Implement the audio processing logic using `Librosa` and `pydub`/`FFmpeg` to handle the multi-resolution chunking (250ms/2s/5s).

3. **Neural Inference:** Integrate the LAION-CLAP model using `PyTorch` and `Hugging Face Transformers` to generate embeddings.

4. **Backend Integration:** Connect your API to the database for storage and retrieval operations using Cosine Distance (`<=>`).

5. **Frontend Visualization:** Build a Next.js (TypeScript/Tailwind) dashboard with an HTML5 audio player and a visual timeline bar that maps search results as colored highlight markers, enabling instant seek functionality.

6. **Benchmarking:** Include an automated test suite comparing EchoFind’s retrieval recall and latency against standard transcription-based pipelines to demonstrate architectural superiority.