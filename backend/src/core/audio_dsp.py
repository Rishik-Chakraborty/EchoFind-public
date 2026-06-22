import numpy as np
import librosa
from typing import List, Dict

class AudioFragmenter:
    """Process raw audio files into multi‑resolution overlapping chunks.

    - Loads audio with librosa, resampling to 48 kHz mono float32.
    - Generates three resolution types (250 ms, 2 s, 5 s) with 25 % overlap.
    - Returns a list of dictionaries containing start/end times, resolution type,
      and a *view* (no copy) of the NumPy slice to keep memory usage low.
    """

    def __init__(self, sample_rate: int = 48000, overlap: float = 0.25):
        self.sample_rate = sample_rate
        self.overlap = overlap
        # Pre‑compute window sizes in samples for each resolution
        self.window_sizes = {
            "250ms": int(0.250 * sample_rate),
            "2s": int(2.0 * sample_rate),
            "5s": int(5.0 * sample_rate),
        }

    def load_audio(self, file_path: str) -> np.ndarray:
        """Load an audio file, resample to target sample_rate, mono, float32."""
        y, sr = librosa.load(file_path, sr=self.sample_rate, mono=True, dtype=np.float32)
        return y

    def _chunk_indices(self, total_samples: int, window: int) -> List[Dict[str, int]]:
        """Calculate start/end sample indices for a given window size and overlap.
        Returns a list of {'start': int, 'end': int} dicts.
        """
        step = int(window * (1 - self.overlap))
        indices = []
        start = 0
        while start < total_samples:
            end = min(start + window, total_samples)
            indices.append({"start": start, "end": end})
            if end == total_samples:
                break
            start += step
        return indices

    def fragment(self, file_path: str) -> List[Dict]:
        """Generate multi‑resolution chunks for *file_path*.
        Each chunk dict contains:
          - start_time (seconds)
          - end_time (seconds)
          - resolution_type ("250ms", "2s", "5s")
          - array (numpy view of the slice)
        """
        audio = self.load_audio(file_path)
        total_samples = audio.shape[0]
        chunks: List[Dict] = []
        for res, win in self.window_sizes.items():
            for idx in self._chunk_indices(total_samples, win):
                start_idx = idx["start"]
                end_idx = idx["end"]
                # Use a NumPy view – no data copy
                array_view = audio[start_idx:end_idx]
                chunks.append({
                    "start_time": start_idx / self.sample_rate,
                    "end_time": end_idx / self.sample_rate,
                    "resolution_type": res,
                    "array": array_view,
                })
        return chunks
