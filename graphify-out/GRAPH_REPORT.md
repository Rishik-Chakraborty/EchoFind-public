# Graph Report - .  (2026-07-01)

## Corpus Check
- 27 files · ~77,883 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 234 nodes · 255 edges · 47 communities (23 shown, 24 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `search()` - 14 edges
3. `ClapEmbedder` - 14 edges
4. `process_upload()` - 13 edges
5. `upload_audio()` - 10 edges
6. `AudioFragmenter` - 10 edges
7. `search_audio()` - 10 edges
8. `Request` - 8 edges
9. `Session` - 7 edges
10. `get_job_status()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Frontend Architecture Flow` --semantically_similar_to--> `Ingestion & DSP Pipeline`  [INFERRED] [semantically similar]
  frontend/content/architecture.md → docs/architecture.md
- `upload_audio()` --shares_data_with--> `audio_jobs Table`  [INFERRED]
  main.py → backend/db/migrations/01_init.sql
- `get_job_status()` --shares_data_with--> `audio_jobs Table`  [INFERRED]
  main.py → backend/db/migrations/01_init.sql
- `test_search_endpoint` --calls--> `search()`  [INFERRED]
  backend/test_auto.py → main.py
- `Ingestion & DSP Pipeline` --references--> `Processing Pipeline Diagram`  [EXTRACTED]
  docs/architecture.md → frontend/public/images/processing_pipeline.png

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Ingestion Pipeline Flow** — core_audio_dsp_audiofragmenter, core_embedder_clapembedder, core_indexer_process_upload [INFERRED 0.85]
- **Semantic Search Flow** — src_main_search, src_main__temporal_rerank, core_embedder_clapembedder [INFERRED 0.85]
- **Docker Compose Stack Components** — docker_compose_db, docker_compose_backend, docker_compose_frontend [EXTRACTED 1.00]

## Communities (47 total, 24 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (45): Session, test_corpus_map, test_search_endpoint, BackgroundTasks, ClapEmbedder, ClapEmbedder.embed_text_query, Singleton wrapper around the LAION-CLAP model.      Uses the ``laion/clap-htsat-, audio_jobs Table (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (18): Session, AudioFragmenter.fragment, ClapEmbedder.embed_audio_batch, _run_embedding, _run_transcription, get_whisper_model(), process_upload(), Update progress on the audio_jobs table. (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (17): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+9 more)

### Community 4 - "Community 4"
Cohesion: 0.21
Nodes (7): ndarray, AudioFragmenter, Load an audio file, resample to target sample_rate, mono, float32.          Appl, Compute the RMS energy of an audio array in decibels., Return start/end sample index dicts for the given window and step., Process raw audio files into multi-resolution overlapping chunks.      Resolutio, Generate multi-resolution chunks for *file_path*.          Each chunk dict:

### Community 5 - "Community 5"
Cohesion: 0.20
Nodes (6): GET Handler, handleProxy, POST Handler, Dashboard(), DashboardContent(), SearchResult

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (11): dependencies, @clerk/nextjs, @clerk/themes, next, plotly.js, react, react-dom, react-markdown (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (4): Test the PCA/KMeans corpus clustering endpoint., Test search endpoint with a standard query., Test health check endpoint., TestEchoFind

### Community 8 - "Community 8"
Cohesion: 0.33
Nodes (4): geistMono, geistSans, inter, metadata

### Community 9 - "Community 9"
Cohesion: 0.60
Nodes (5): count_repo_lines(), git(), load_previous_count(), main(), save_current_count()

### Community 10 - "Community 10"
Cohesion: 0.40
Nodes (3): ndarray, Encode a list of audio numpy arrays into a (N, 512) ndarray.          The proces, Encode a text query into a (512,) ndarray.

### Community 11 - "Community 11"
Cohesion: 0.60
Nodes (4): BaseModel, SearchRequest, SearchResult, UploadResponse

### Community 12 - "Community 12"
Cohesion: 0.50
Nodes (4): EchoFind API Service, Backend Service, Database Service (pgvector), Frontend Service

### Community 13 - "Community 13"
Cohesion: 0.50
Nodes (4): Librosa Dependency, Frontend Architecture Flow, Ingestion & DSP Pipeline, Processing Pipeline Diagram

### Community 14 - "Community 14"
Cohesion: 0.83
Nodes (3): GET(), handleProxy(), POST()

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (3): EchoFind, Faster-Whisper Transcription, LAION-CLAP Integration

## Knowledge Gaps
- **90 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `inter`, `eslintConfig` (+85 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ClapEmbedder` connect `Community 0` to `Community 2`, `Community 10`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `process_upload()` connect `Community 2` to `Community 0`, `Community 4`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `AudioFragmenter` connect `Community 4` to `Community 0`, `Community 2`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `process_upload()` (e.g. with `audio_chunks Table` and `audio_files Table`) actually correct?**
  _`process_upload()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Poll job indexing status.`, `Fusion model: match multi-resolution chunks from different windows     and weigh`, `Merge overlapping/adjacent chunks into contiguous acoustic events and     boost` to the rest of the system?**
  _122 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06431372549019608 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._