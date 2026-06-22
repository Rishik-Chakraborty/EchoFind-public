import numpy as np
import librosa
from typing import List, Dict

class AudioFragmenter:
    """Process raw audio files into multi-resolution overlapping chunks.

    Resolution tiers and their overlap ratios:
    - 250ms  (transients):        75% overlap → 62.5ms step  — very dense, catches short squeaks/clicks
    - 2s     (localized speech):  50% overlap → 1s step      — balanced coverage
    - 5s     (contextual):        50% overlap → 2.5s step    — contextual soundscapes

    Using per-resolution overlap lets us be maximally precise at the transient
    tier (where you might miss a 50ms squeak with only 25% overlap) while
    keeping the larger tiers reasonably sized.
    """

    RESOLUTIONS = {
        "250ms": {"duration": 0.250, "overlap": 0.75},
        "2s":    {"duration": 2.0,   "overlap": 0.50},
        "5s":    {"duration": 5.0,   "overlap": 0.50},
    }

    def __init__(self, sample_rate: int = 48000):
        self.sample_rate = sample_rate
        # Pre-compute (window_samples, step_samples) per resolution
        self.windows: Dict[str, Dict[str, int]] = {}
        for name, cfg in self.RESOLUTIONS.items():
            win = int(cfg["duration"] * sample_rate)
            step = int(win * (1.0 - cfg["overlap"]))
            self.windows[name] = {"win": win, "step": max(step, 1)}

    def load_audio(self, file_path: str) -> np.ndarray:
        """Load an audio file, resample to target sample_rate, mono, float32."""
        y, _ = librosa.load(file_path, sr=self.sample_rate, mono=True, dtype=np.float32)
        return y

    def _chunk_indices(self, total_samples: int, win: int, step: int) -> List[Dict[str, int]]:
        """Return start/end sample index dicts for the given window and step."""
        indices = []
        start = 0
        while start < total_samples:
            end = min(start + win, total_samples)
            indices.append({"start": start, "end": end})
            if end == total_samples:
                break
            start += step
        return indices

    def fragment(self, file_path: str) -> List[Dict]:
        """Generate multi-resolution chunks for *file_path*.

        Each chunk dict:
          - start_time       (seconds, float)
          - end_time         (seconds, float)
          - resolution_type  ("250ms" | "2s" | "5s")
          - array            (np.ndarray view, float32, shape=(n_samples,))
        """
        audio = self.load_audio(file_path)
        total_samples = audio.shape[0]
        chunks: List[Dict] = []

        for res, cfg in self.windows.items():
            win, step = cfg["win"], cfg["step"]
            for idx in self._chunk_indices(total_samples, win, step):
                s, e = idx["start"], idx["end"]
                chunks.append({
                    "start_time": s / self.sample_rate,
                    "end_time":   e / self.sample_rate,
                    "resolution_type": res,
                    "array": audio[s:e],   # NumPy view — no copy
                })

        return chunks
