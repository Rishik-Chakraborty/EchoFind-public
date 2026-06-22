# Graph Report - EchoFind  (2026-06-22)

## Corpus Check
- 21 files · ~5,919 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 47 nodes · 52 edges · 8 communities (6 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fe05c1de`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]

## God Nodes (most connected - your core abstractions)
1. `ClapEmbedder` - 8 edges
2. `AudioFragmenter` - 7 edges
3. `search()` - 6 edges
4. `_temporal_rerank()` - 4 edges
5. `EchoFind` - 4 edges
6. `SearchResult` - 3 edges
7. `_build_queries()` - 3 edges
8. `process_upload()` - 3 edges
9. `get_job_status()` - 2 edges
10. `geistSans` - 1 edges

## Surprising Connections (you probably didn't know these)
- `search()` --calls--> `ClapEmbedder`  [EXTRACTED]
  main.py → backend/src/core/embedder.py
- `process_upload()` --calls--> `AudioFragmenter`  [EXTRACTED]
  backend/src/core/indexer.py → backend/src/core/audio_dsp.py
- `process_upload()` --calls--> `ClapEmbedder`  [EXTRACTED]
  backend/src/core/indexer.py → backend/src/core/embedder.py
- `_temporal_rerank()` --calls--> `SearchResult`  [INFERRED]
  main.py → page.tsx
- `search()` --calls--> `SearchResult`  [INFERRED]
  main.py → page.tsx

## Communities (8 total, 2 thin omitted)

### Community 1 - "Community 1"
Cohesion: 0.28
Nodes (5): AudioFragmenter, Load an audio file, resample to target sample_rate, mono, float32., Return start/end sample index dicts for the given window and step., Generate multi-resolution chunks for *file_path*.          Each chunk dict:, Process raw audio files into multi-resolution overlapping chunks.      Resolutio

### Community 2 - "Community 2"
Cohesion: 0.29
Nodes (4): ClapEmbedder, Singleton wrapper around the LAION-CLAP model.      - Loads the model on CPU (or, Encode a list of audio numpy arrays into a (N, 512) ndarray.          NOTE: The, Encode a text query into a (512,) ndarray.

### Community 3 - "Community 3"
Cohesion: 0.40
Nodes (3): SearchResult, Merge overlapping/adjacent chunks into contiguous acoustic events and     boost, _temporal_rerank()

### Community 4 - "Community 4"
Cohesion: 0.40
Nodes (4): EchoFind, How to Build It: A Sequential Strategy, Key Technical Infrastructure (v3.0), Performance Expectations

### Community 6 - "Community 6"
Cohesion: 0.50
Nodes (4): _build_queries(), Return up to n query phrasings for ensemble embedding., Semantic audio search with query ensemble + temporal reranking.      Steps:, search()

### Community 7 - "Community 7"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

## Knowledge Gaps
- **6 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `Key Technical Infrastructure (v3.0)`, `Performance Expectations` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ClapEmbedder` connect `Community 2` to `Community 0`, `Community 6`?**
  _High betweenness centrality (0.420) - this node is a cross-community bridge._
- **Why does `search()` connect `Community 6` to `Community 2`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.315) - this node is a cross-community bridge._
- **Why does `process_upload()` connect `Community 0` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.256) - this node is a cross-community bridge._
- **What connects `geistSans`, `geistMono`, `metadata` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._