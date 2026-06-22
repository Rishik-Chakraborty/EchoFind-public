# Graph Report - EchoFind  (2026-06-22)

## Corpus Check
- 21 files · ~5,802 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 57 nodes · 65 edges · 10 communities (6 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0c6c7620`
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
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `ClapEmbedder` - 8 edges
2. `search()` - 7 edges
3. `AudioFragmenter` - 7 edges
4. `main()` - 5 edges
5. `_temporal_rerank()` - 5 edges
6. `_build_queries()` - 4 edges
7. `EchoFind` - 4 edges
8. `get_job_status()` - 3 edges
9. `SearchResult` - 3 edges
10. `process_upload()` - 3 edges

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

## Communities (10 total, 4 thin omitted)

### Community 2 - "Community 2"
Cohesion: 0.29
Nodes (4): ClapEmbedder, Singleton wrapper around the LAION-CLAP model.      - Loads the model on CPU (or, Encode a list of audio numpy arrays into a (N, 512) ndarray.          NOTE: The, Encode a text query into a (512,) ndarray.

### Community 3 - "Community 3"
Cohesion: 0.25
Nodes (7): SearchResult, Semantic audio search with query ensemble + temporal reranking.      Steps:, Semantic audio search with query ensemble + temporal reranking.      Steps:, Merge overlapping/adjacent chunks into contiguous acoustic events and     boost, Merge overlapping/adjacent chunks into contiguous acoustic events and     boost, search(), _temporal_rerank()

### Community 4 - "Community 4"
Cohesion: 0.40
Nodes (4): EchoFind, How to Build It: A Sequential Strategy, Key Technical Infrastructure (v3.0), Performance Expectations

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (6): _build_queries(), get_job_status(), Return up to n query phrasings for ensemble embedding., Return up to n query phrasings for ensemble embedding., Poll job indexing status., Poll job indexing status.

### Community 6 - "Community 6"
Cohesion: 0.60
Nodes (5): count_repo_lines(), git(), load_previous_count(), main(), save_current_count()

### Community 7 - "Community 7"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

## Knowledge Gaps
- **6 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `Key Technical Infrastructure (v3.0)`, `Performance Expectations` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ClapEmbedder` connect `Community 2` to `Community 0`, `Community 3`?**
  _High betweenness centrality (0.339) - this node is a cross-community bridge._
- **Why does `search()` connect `Community 3` to `Community 2`, `Community 5`?**
  _High betweenness centrality (0.289) - this node is a cross-community bridge._
- **Why does `process_upload()` connect `Community 0` to `Community 8`, `Community 2`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **What connects `Poll job indexing status.`, `Merge overlapping/adjacent chunks into contiguous acoustic events and     boost`, `Return up to n query phrasings for ensemble embedding.` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._