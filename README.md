# EchoFind

## Automatic Commit Every 100 Lines

The repository includes a helper that automatically stages, commits, and pushes to `main` each time at least **100 new lines of code** are added.

- **How it works:** A Git *pre‑commit* hook runs `backend/commit_tracker.py`.
- **Customization:** Edit `THRESHOLD` in `backend/commit_tracker.py` to change the line‑count trigger or modify `INCLUDE_EXTS` to adjust which file types are counted.
- **Manual trigger:** Run `python backend/commit_tracker.py` to force a check at any time.

> ⚠️ Ensure you have write access to the remote `origin/main` branch before using this workflow.