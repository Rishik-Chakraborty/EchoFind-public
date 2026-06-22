# Graph Report - EchoFind  (2026-06-22)

## Corpus Check
- 21 files · ~5,071 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 40 nodes · 48 edges · 5 communities
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c87fe88f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]

## God Nodes (most connected - your core abstractions)
1. `ClapEmbedder` - 8 edges
2. `AudioFragmenter` - 7 edges
3. `search()` - 5 edges
4. `EchoFind` - 4 edges
5. `_temporal_rerank()` - 4 edges
6. `process_upload()` - 3 edges
7. `SearchResult` - 3 edges
8. `get_job_status()` - 2 edges
9. `Key Technical Infrastructure (v3.0)` - 1 edges
10. `Performance Expectations` - 1 edges

## Surprising Connections (you probably didn't know these)
- `process_upload()` --calls--> `AudioFragmenter`  [EXTRACTED]
  backend/src/core/indexer.py → backend/src/core/audio_dsp.py
- `process_upload()` --calls--> `ClapEmbedder`  [EXTRACTED]
  backend/src/core/indexer.py → backend/src/core/embedder.py
- `search()` --calls--> `ClapEmbedder`  [EXTRACTED]
  backend/src/main.py → backend/src/core/embedder.py
- `_temporal_rerank()` --calls--> `SearchResult`  [INFERRED]
  backend/src/main.py → frontend/app/page.tsx
- `search()` --calls--> `SearchResult`  [INFERRED]
  backend/src/main.py → frontend/app/page.tsx

## Communities (5 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.24
Nodes (3): process_upload(), get_job_status(), Poll job indexing status.

### Community 1 - "Community 1"
Cohesion: 0.24
Nodes (5): AudioFragmenter, Load an audio file, resample to target sample_rate, mono, float32., Return start/end sample index dicts for the given window and step., Generate multi-resolution chunks for *file_path*.          Each chunk dict:, Process raw audio files into multi-resolution overlapping chunks.      Resolutio

### Community 2 - "Community 2"
Cohesion: 0.29
Nodes (4): ClapEmbedder, Singleton wrapper around the LAION-CLAP model.      - Loads the model on CPU (or, Encode a list of audio numpy arrays into a (N, 512) ndarray.          NOTE: The, Encode a text query into a (512,) ndarray.

### Community 3 - "Community 3"
Cohesion: 0.33
Nodes (5): SearchResult, Semantic audio search with temporal reranking.      Steps:     1. Embed the text, Merge overlapping/adjacent chunks into contiguous acoustic events and     boost, search(), _temporal_rerank()

### Community 4 - "Community 4"
Cohesion: 0.40
Nodes (4): EchoFind, How to Build It: A Sequential Strategy, Key Technical Infrastructure (v3.0), Performance Expectations

## Knowledge Gaps
- **3 isolated node(s):** `Key Technical Infrastructure (v3.0)`, `Performance Expectations`, `How to Build It: A Sequential Strategy`
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ClapEmbedder` connect `Community 2` to `Community 0`, `Community 3`?**
  _High betweenness centrality (0.364) - this node is a cross-community bridge._
- **Why does `AudioFragmenter` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.305) - this node is a cross-community bridge._
- **Why does `process_upload()` connect `Community 0` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.249) - this node is a cross-community bridge._
- **What connects `Key Technical Infrastructure (v3.0)`, `Performance Expectations`, `How to Build It: A Sequential Strategy` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._