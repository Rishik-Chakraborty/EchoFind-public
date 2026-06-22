#!/usr/bin/env python3
"""commit_tracker.py
Automatically stage, commit, and push changes when >= THRESHOLD new lines are added.

Usage:
    python3 backend/commit_tracker.py

The script can be called manually or via a Git pre‑commit hook.
"""
import os
import subprocess
import sys
import json
from pathlib import Path
from datetime import datetime

# ----- Configuration -----
REPO_ROOT = Path(__file__).resolve().parents[1]  # project root (.. from backend)
COUNTER_FILE = REPO_ROOT / ".line_counter"
THRESHOLD = 100  # lines added before auto‑commit
# File extensions to include in line count
INCLUDE_EXTS = {
    ".py", ".js", ".ts", ".sql", ".go", ".java", ".c", ".cpp",
    ".html", ".css", ".tsx", ".jsx",
}

def load_previous_count() -> int:
    try:
        return int(COUNTER_FILE.read_text().strip())
    except Exception:
        return 0

def save_current_count(count: int):
    COUNTER_FILE.write_text(str(count))

def count_repo_lines() -> int:
    total = 0
    for path in REPO_ROOT.rglob("*"):
        if path.is_file() and path.suffix.lower() in INCLUDE_EXTS:
            try:
                with path.open("r", encoding="utf-8", errors="ignore") as f:
                    total += sum(1 for line in f if line.strip())  # non‑blank lines
            except Exception:
                continue
    return total

def git(*args, capture_output=False):
    result = subprocess.run(["git", *args], cwd=REPO_ROOT, text=True,
                            capture_output=capture_output)
    if result.returncode != 0:
        print(f"Git command failed: git {' '.join(args)}", file=sys.stderr)
        if capture_output:
            print(result.stderr, file=sys.stderr)
        sys.exit(1)
    return result.stdout if capture_output else None

def main():
    prev = load_previous_count()
    curr = count_repo_lines()
    diff = curr - prev
    if diff < THRESHOLD:
        # Nothing to do – just update counter if this is the first run
        if prev == 0:
            save_current_count(curr)
        sys.exit(0)

    # Stage all changes
    git("add", "-A")
    # Create commit message
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    msg = f"Auto‑commit: +{diff} lines (≥{THRESHOLD}) – {timestamp}"
    git("commit", "-m", msg)
    # Push to origin/main
    git("push", "origin", "main")
    # Update counter
    save_current_count(curr)

if __name__ == "__main__":
    main()
