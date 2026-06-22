# Graph Report - EchoFind  (2026-06-22)

## Corpus Check
- 21 files · ~6,392 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 64 nodes · 79 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `01cdac89`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `search()` - 9 edges
2. `ClapEmbedder` - 8 edges
3. `AudioFragmenter` - 7 edges
4. `_temporal_rerank()` - 7 edges
5. `_build_queries()` - 6 edges
6. `main()` - 5 edges
7. `get_job_status()` - 4 edges
8. `SearchResult` - 4 edges
9. `EchoFind` - 4 edges
10. `process_upload()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Merge overlapping/adjacent chunks into contiguous acoustic events and     boost` --rationale_for--> `_temporal_rerank()`  [EXTRACTED]
  main.py → backend/src/main.py
- `Merge overlapping/adjacent chunks into contiguous acoustic events and     boost` --rationale_for--> `_temporal_rerank()`  [EXTRACTED]
  main.py → backend/src/main.py
- `Return up to n query phrasings for ensemble embedding.` --rationale_for--> `_build_queries()`  [EXTRACTED]
  main.py → backend/src/main.py
- `Return up to n query phrasings for ensemble embedding.` --rationale_for--> `_build_queries()`  [EXTRACTED]
  main.py → backend/src/main.py
- `Semantic audio search with query ensemble + temporal reranking.      Steps:` --rationale_for--> `search()`  [EXTRACTED]
  main.py → backend/src/main.py

## Communities (8 total, 1 thin omitted)

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (5): ClapEmbedder, Singleton wrapper around the LAION-CLAP model.      Uses the larger ``laion/larg, Encode a list of audio numpy arrays into a (N, 512) ndarray.          The proces, Encode a text query into a (512,) ndarray., process_upload()

### Community 3 - "Community 3"
Cohesion: 0.29
Nodes (6): Home(), SearchResult, Merge overlapping/adjacent chunks into contiguous acoustic events and     boost, Merge overlapping/adjacent chunks into contiguous acoustic events and     boost, Merge overlapping/adjacent chunks into contiguous acoustic events,     apply cro, _temporal_rerank()

### Community 4 - "Community 4"
Cohesion: 0.40
Nodes (4): EchoFind, How to Build It: A Sequential Strategy, Key Technical Infrastructure (v3.0), Performance Expectations

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (13): _build_queries(), get_job_status(), health(), Return up to n query phrasings for ensemble embedding., Return up to n query phrasings for ensemble embedding., Semantic audio search with query ensemble + temporal reranking.      Steps:, Semantic audio search with query ensemble + temporal reranking.      Steps:, Return up to n query phrasings for ensemble embedding. (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.60
Nodes (5): count_repo_lines(), git(), load_previous_count(), main(), save_current_count()

### Community 7 - "Community 7"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 8 - "Community 8"
Cohesion: 0.24
Nodes (6): AudioFragmenter, Load an audio file, resample to target sample_rate, mono, float32.          Appl, Return start/end sample index dicts for the given window and step., Process raw audio files into multi-resolution overlapping chunks.      Resolutio, Generate multi-resolution chunks for *file_path*.          Each chunk dict:, _rms_db()

## Knowledge Gaps
- **6 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `Key Technical Infrastructure (v3.0)`, `Performance Expectations` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ClapEmbedder` connect `Community 2` to `Community 5`?**
  _High betweenness centrality (0.271) - this node is a cross-community bridge._
- **Why does `search()` connect `Community 5` to `Community 2`, `Community 3`?**
  _High betweenness centrality (0.243) - this node is a cross-community bridge._
- **Why does `process_upload()` connect `Community 2` to `Community 8`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **What connects `Process raw audio files into multi-resolution overlapping chunks.      Resolutio`, `Load an audio file, resample to target sample_rate, mono, float32.          Appl`, `Compute the RMS energy of an audio array in decibels.` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._