# Graph Report - .  (2026-06-26)

## Corpus Check
- 36 files · ~11,052 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 182 nodes · 234 edges · 26 communities (16 shown, 10 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend API Routing|Backend API Routing]]
- [[_COMMUNITY_DSP Chunking Pipeline|DSP Chunking Pipeline]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Frontend NPM Scripts|Frontend NPM Scripts]]
- [[_COMMUNITY_Hybrid Search Logic|Hybrid Search Logic]]
- [[_COMMUNITY_CLAP Embedder Engine|CLAP Embedder Engine]]
- [[_COMMUNITY_Backend Testing Suite|Backend Testing Suite]]
- [[_COMMUNITY_Dashboard UI Components|Dashboard UI Components]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Nextjs App Layout|Nextjs App Layout]]
- [[_COMMUNITY_Commit Tracker Script|Commit Tracker Script]]
- [[_COMMUNITY_Landing Page Animations|Landing Page Animations]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Nextjs Config|Nextjs Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Proxy Configuration|Proxy Configuration]]
- [[_COMMUNITY_Default Proxy Route|Default Proxy Route]]
- [[_COMMUNITY_File Icon SVG|File Icon SVG]]
- [[_COMMUNITY_Globe Icon SVG|Globe Icon SVG]]
- [[_COMMUNITY_Next Logo SVG|Next Logo SVG]]
- [[_COMMUNITY_Vercel Logo SVG|Vercel Logo SVG]]
- [[_COMMUNITY_Window Icon SVG|Window Icon SVG]]

## God Nodes (most connected - your core abstractions)
1. `search()` - 18 edges
2. `compilerOptions` - 16 edges
3. `ClapEmbedder` - 13 edges
4. `AudioFragmenter` - 11 edges
5. `process_upload()` - 11 edges
6. `search_audio()` - 10 edges
7. `Session` - 9 edges
8. `UploadResponse` - 8 edges
9. `SearchRequest` - 8 edges
10. `SearchResult` - 8 edges

## Surprising Connections (you probably didn't know these)
- `search()` --implements--> `Hybrid Search Execution`  [INFERRED]
  main.py → README.md
- `search()` --implements--> `Query Ensemble & Expansion`  [INFERRED]
  main.py → README.md
- `search()` --semantically_similar_to--> `search_audio()`  [INFERRED] [semantically similar]
  main.py → backend/src/main.py
- `AudioFragmenter` --implements--> `Dynamic Onset Segmentation`  [INFERRED]
  backend/src/core/audio_dsp.py → README.md
- `get_corpus_map()` --implements--> `Corpus Mapping`  [INFERRED]
  backend/src/main.py → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Audio Ingestion Pipeline** — src_main_upload_audio, core_indexer_process_upload, core_audio_dsp_fragment, core_indexer__run_embedding, core_indexer__run_transcription [INFERRED 0.85]
- **Hybrid Search Pipeline** — src_main_search, core_embedder_embed_text_query, src_main__temporal_rerank [INFERRED 0.85]

## Communities (26 total, 10 thin omitted)

### Community 0 - "Backend API Routing"
Cohesion: 0.12
Nodes (28): Session, test_corpus_map, BackgroundTasks, BaseModel, Corpus Mapping, SearchRequest, SearchResult, get_db() (+20 more)

### Community 1 - "DSP Chunking Pipeline"
Cohesion: 0.12
Nodes (18): ndarray, Session, AudioFragmenter, AudioFragmenter.fragment, Load an audio file, resample to target sample_rate, mono, float32.          Appl, Compute the RMS energy of an audio array in decibels., Return start/end sample index dicts for the given window and step., Process raw audio files into multi-resolution overlapping chunks.      Resolutio (+10 more)

### Community 2 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 3 - "Frontend NPM Scripts"
Cohesion: 0.11
Nodes (17): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+9 more)

### Community 4 - "Hybrid Search Logic"
Cohesion: 0.12
Nodes (16): test_search_endpoint, ClapEmbedder.embed_audio_batch, ClapEmbedder.embed_text_query, _run_embedding, _run_transcription, Hybrid Search Execution, Query Ensemble & Expansion, Temporal Attention Reranking (+8 more)

### Community 5 - "CLAP Embedder Engine"
Cohesion: 0.22
Nodes (6): ndarray, ClapEmbedder, Singleton wrapper around the LAION-CLAP model.      Uses the ``laion/clap-htsat-, Encode a list of audio numpy arrays into a (N, 512) ndarray.          The proces, Encode a text query into a (512,) ndarray., startup_event()

### Community 6 - "Backend Testing Suite"
Cohesion: 0.25
Nodes (4): Test the PCA/KMeans corpus clustering endpoint., Test search endpoint with a standard query., Test health check endpoint., TestEchoFind

### Community 7 - "Dashboard UI Components"
Cohesion: 0.46
Nodes (7): Dashboard(), DashboardContent(), Panel(), SearchIcon(), SearchResult, UploadCloudIcon(), WaveformIcon()

### Community 8 - "Frontend Dependencies"
Cohesion: 0.25
Nodes (8): dependencies, @clerk/nextjs, @clerk/themes, next, plotly.js, react, react-dom, react-plotly.js

### Community 9 - "Nextjs App Layout"
Cohesion: 0.33
Nodes (4): geistMono, geistSans, inter, metadata

### Community 10 - "Commit Tracker Script"
Cohesion: 0.60
Nodes (5): count_repo_lines(), git(), load_previous_count(), main(), save_current_count()

### Community 11 - "Landing Page Animations"
Cohesion: 0.50
Nodes (3): LandingPage(), Scroll-Driven Animations, View Timeline

## Knowledge Gaps
- **58 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `inter`, `eslintConfig` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ClapEmbedder` connect `CLAP Embedder Engine` to `Backend API Routing`, `DSP Chunking Pipeline`, `Hybrid Search Logic`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `process_upload()` connect `DSP Chunking Pipeline` to `Backend API Routing`, `Hybrid Search Logic`, `CLAP Embedder Engine`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `search()` (e.g. with `test_search_endpoint` and `_run_embedding`) actually correct?**
  _`search()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `AudioFragmenter` (e.g. with `Session` and `Dynamic Onset Segmentation`) actually correct?**
  _`AudioFragmenter` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Poll job indexing status.`, `Fusion model: match multi-resolution chunks from different windows     and weigh`, `Merge overlapping/adjacent chunks into contiguous acoustic events,     apply cro` to the rest of the system?**
  _90 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend API Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.11693548387096774 - nodes in this community are weakly interconnected._
- **Should `DSP Chunking Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.12333333333333334 - nodes in this community are weakly interconnected._