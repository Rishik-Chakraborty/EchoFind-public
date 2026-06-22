import numpy as np
import librosa
from typing import List, Dict

class AudioFragmenter:
    """Process raw audio files into multi-resolution overlapping chunks.

    Resolution tiers and their overlap ratios:
    - 250ms  (transients):        75% overlap → 62.5ms step  — very dense, catches short squeaks/clicks
    - 1s     (short events):      50% overlap → 500ms step   — door slams, barks, coughs, single words
    - 2s     (localized speech):  50% overlap → 1s step      — balanced coverage
    - 5s     (contextual):        50% overlap → 2.5s step    — contextual soundscapes

    Using per-resolution overlap lets us be maximally precise at the transient
    tier (where you might miss a 50ms squeak with only 25% overlap) while
    keeping the larger tiers reasonably sized.
    """

    RESOLUTIONS = {
        "250ms": {"duration": 0.250, "overlap": 0.75},
        "1s":    {"duration": 1.0,   "overlap": 0.50},
        "2s":    {"duration": 2.0,   "overlap": 0.50},
        "5s":    {"duration": 5.0,   "overlap": 0.50},
        "10s":   {"duration": 10.0,  "overlap": 0.50},
    }

    # Chunks with RMS energy below this dB threshold are considered silence
    # and excluded from the index to avoid polluting the vector space.
    SILENCE_THRESHOLD_DB = -60.0

    def __init__(self, sample_rate: int = 48000):
        self.sample_rate = sample_rate
        # Pre-compute (window_samples, step_samples) per resolution
        self.windows: Dict[str, Dict[str, int]] = {}
        for name, cfg in self.RESOLUTIONS.items():
            win = int(cfg["duration"] * sample_rate)
            step = int(win * (1.0 - cfg["overlap"]))
            self.windows[name] = {"win": win, "step": max(step, 1)}

    def load_audio(self, file_path: str) -> np.ndarray:
        """Load an audio file, resample to target sample_rate, mono, float32.

        Applies peak-normalization to [-1, 1] so embeddings are consistent
        across files recorded at different volumes.
        """
        y, _ = librosa.load(file_path, sr=self.sample_rate, mono=True, dtype=np.float32)
        # Peak-normalise to [-1, 1]
        peak = np.max(np.abs(y))
        if peak > 0:
            y = y / peak
        return y

    @staticmethod
    def _rms_db(arr: np.ndarray) -> float:
        """Compute the RMS energy of an audio array in decibels."""
        rms = np.sqrt(np.mean(arr ** 2) + 1e-12)
        return 20.0 * np.log10(rms + 1e-12)

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
          - resolution_type  ("250ms" | "1s" | "2s" | "5s")
          - array            (np.ndarray view, float32, shape=(n_samples,))

        Silent chunks (below SILENCE_THRESHOLD_DB) are automatically excluded.
        """
        audio = self.load_audio(file_path)
        total_samples = audio.shape[0]
        chunks: List[Dict] = []

        for res, cfg in self.windows.items():
            win, step = cfg["win"], cfg["step"]
            for idx in self._chunk_indices(total_samples, win, step):
                s, e = idx["start"], idx["end"]
                chunk_array = audio[s:e]

                # Skip silent/near-silent chunks
                if self._rms_db(chunk_array) < self.SILENCE_THRESHOLD_DB:
                    continue

                chunks.append({
                    "start_time": s / self.sample_rate,
                    "end_time":   e / self.sample_rate,
                    "resolution_type": res,
                    "array": chunk_array,
                })

        return chunks
