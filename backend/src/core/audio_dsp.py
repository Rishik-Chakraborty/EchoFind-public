import numpy as np
import librosa
from typing import List, Dict

class AudioFragmenter:
    """Process raw audio files into multi-resolution overlapping chunks.

    Resolution tiers (no overlap — onset detection handles transients):
    - 1s     (short events):      0% overlap → 1s step   — door slams, barks, coughs, single words
    - 2s     (localized speech):  0% overlap → 2s step   — balanced coverage

    The 250ms dense grid was removed because the onset detector catches
    transients more precisely with far fewer chunks. The 5s tier was removed
    because it was always filtered out during temporal reranking.
    """

    RESOLUTIONS = {
        "2s":    {"duration": 2.0,   "overlap": 0.00},
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
        y, _ = librosa.load(file_path, sr=self.sample_rate, mono=True, dtype=np.float32, res_type='soxr_hq')
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
          - resolution_type  ("1s" | "2s" | "onset")
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

        # --- Dynamic Onset Segmentation (capped at 50 to avoid chunk explosion) ---
        try:
            # Detect transient events
            onset_frames = librosa.onset.onset_detect(y=audio, sr=self.sample_rate)
            onset_times = librosa.frames_to_time(onset_frames, sr=self.sample_rate)

            # Cap at 50 onsets — subsample evenly if there are more
            if len(onset_times) > 50:
                step = len(onset_times) / 50
                onset_times = [onset_times[int(i * step)] for i in range(50)]

            # For each onset, create a precise 500ms chunk (-100ms to +400ms)
            for t in onset_times:
                s_time = max(0.0, t - 0.1)
                e_time = min(total_samples / self.sample_rate, t + 0.4)
                
                s_idx = int(s_time * self.sample_rate)
                e_idx = int(e_time * self.sample_rate)
                chunk_array = audio[s_idx:e_idx]
                
                if len(chunk_array) == 0 or self._rms_db(chunk_array) < self.SILENCE_THRESHOLD_DB:
                    continue
                    
                chunks.append({
                    "start_time": s_time,
                    "end_time": e_time,
                    "resolution_type": "onset",
                    "array": chunk_array,
                })
        except Exception as e:
            print(f"Warning: Onset detection failed: {e}")

        return chunks
