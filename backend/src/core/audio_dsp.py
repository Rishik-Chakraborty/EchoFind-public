import numpy as np
import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class AudioFragmenter:
    """Process raw audio files into multi-resolution overlapping chunks.

    Resolution tiers (no overlap — onset detection handles transients):
    - 2s     (localized events): 0% overlap → 2s step   — balanced coverage

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

    # ---------------------------------------------------------------------------
    # Fast onset detection parameters — replaces the expensive librosa spectral
    # onset detector with a lightweight RMS energy-spike detector.
    # ---------------------------------------------------------------------------
    # Window size in seconds for computing RMS energy in the onset detector.
    _ONSET_RMS_WINDOW_S = 0.02   # 20 ms (960 samples at 48 kHz)
    # A sample is an onset if its RMS is this many dB above the local mean.
    _ONSET_THRESHOLD_DB = 12.0
    # Minimum gap in seconds between consecutive onsets to avoid duplicates.
    _ONSET_MIN_GAP_S = 0.15

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

        For WAV files (produced by the ffmpeg segmenter at 48 kHz) we use
        ``soundfile`` for a direct native read that bypasses librosa's heavy
        Python resampling stack — roughly 5–10× faster for the common case.
        Other formats fall back to librosa as before.

        Applies peak-normalization to [-1, 1] so embeddings are consistent
        across files recorded at different volumes.
        """
        ext = os.path.splitext(file_path)[1].lower()

        if ext == ".wav":
            # Fast path: native C read via soundfile (libsndfile)
            import soundfile as sf
            y, sr = sf.read(file_path, dtype="float32", always_2d=False)
            # Convert multi-channel to mono by averaging
            if y.ndim > 1:
                y = y.mean(axis=1)
            # Resample only if the actual sample rate differs from target
            # (shouldn't happen when ffmpeg is called with -ar 48000)
            if sr != self.sample_rate:
                import librosa
                y = librosa.resample(y, orig_sr=sr, target_sr=self.sample_rate)
        else:
            # Slow path: librosa handles arbitrary compressed formats
            import librosa
            y, _ = librosa.load(
                file_path, sr=self.sample_rate, mono=True,
                dtype=np.float32, res_type="kaiser_fast",
            )

        # Peak-normalise to [-1, 1]
        peak = np.max(np.abs(y))
        if peak > 0:
            y = y / peak
        return y

    def load_audio_from_array(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """Accept a pre-decoded mono float32 array and normalise it.

        Used by the in-memory pipeline where audio has already been decoded
        from the file without writing intermediate WAV segments to disk.
        """
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if sr != self.sample_rate:
            import librosa
            audio = librosa.resample(audio, orig_sr=sr, target_sr=self.sample_rate)
        audio = audio.astype(np.float32)
        peak = np.max(np.abs(audio))
        if peak > 0:
            audio = audio / peak
        return audio

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

    # ------------------------------------------------------------------
    # Fast onset detection (pure NumPy — replaces librosa.onset.onset_detect)
    # ------------------------------------------------------------------

    def _detect_onsets_fast(self, audio: np.ndarray) -> np.ndarray:
        """Detect transient onsets using an RMS energy-spike heuristic.

        Algorithm:
        1. Compute windowed RMS energy in dB over short frames.
        2. Compute a running local mean of the RMS curve (±5 frames).
        3. Mark frames where RMS exceeds the local mean by a threshold as onsets.
        4. Enforce a minimum gap between consecutive onsets.

        This is ~100× faster than ``librosa.onset.onset_detect`` because it
        avoids computing a full STFT / spectral flux, and operates entirely
        on pre-computed numpy arrays with no Python loop over samples.

        Returns an array of onset times in seconds.
        """
        win_samples = max(int(self._ONSET_RMS_WINDOW_S * self.sample_rate), 1)
        hop = win_samples  # non-overlapping windows for speed

        n_frames = len(audio) // hop
        if n_frames < 3:
            return np.array([])

        # Reshape into (n_frames, hop) and compute RMS per frame
        trimmed = audio[: n_frames * hop].reshape(n_frames, hop)
        rms = np.sqrt(np.mean(trimmed ** 2, axis=1) + 1e-12)
        rms_db = 20.0 * np.log10(rms + 1e-12)

        # Local mean with a ±5-frame window (convolution is vectorised C)
        kernel_size = 11
        kernel = np.ones(kernel_size) / kernel_size
        local_mean = np.convolve(rms_db, kernel, mode="same")

        # Onsets = frames significantly louder than the local average
        spike_mask = (rms_db - local_mean) > self._ONSET_THRESHOLD_DB

        onset_frames = np.nonzero(spike_mask)[0]
        if len(onset_frames) == 0:
            return np.array([])

        # Convert frames to seconds
        onset_times_all = onset_frames.astype(np.float64) * hop / self.sample_rate

        # Enforce minimum gap between consecutive onsets
        min_gap = self._ONSET_MIN_GAP_S
        filtered = [onset_times_all[0]]
        for t in onset_times_all[1:]:
            if t - filtered[-1] >= min_gap:
                filtered.append(t)

        return np.array(filtered)

    # ------------------------------------------------------------------
    # Main fragmentation
    # ------------------------------------------------------------------

    def fragment(self, file_path: str) -> List[Dict]:
        """Generate multi-resolution chunks for *file_path*.

        Each chunk dict:
          - start_time       (seconds, float)
          - end_time         (seconds, float)
          - resolution_type  ("2s" | "onset")
          - array            (np.ndarray view, float32, shape=(n_samples,))

        Silent chunks (below SILENCE_THRESHOLD_DB) are automatically excluded.
        """
        audio = self.load_audio(file_path)
        return self._fragment_from_array(audio)

    def fragment_from_array(self, audio: np.ndarray, sr: int) -> List[Dict]:
        """Generate multi-resolution chunks from a pre-decoded audio array.

        Same output format as ``fragment()`` but skips the file-loading step.
        The array is peak-normalised and resampled if ``sr`` differs.
        """
        normed = self.load_audio_from_array(audio, sr)
        return self._fragment_from_array(normed)

    def _fragment_from_array(self, audio: np.ndarray) -> List[Dict]:
        """Core fragmentation logic operating on a normalised float32 array."""
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

        # --- Fast onset detection (pure NumPy — replaces librosa spectral method) ---
        try:
            onset_times = self._detect_onsets_fast(audio)

            # Cap at 50 onsets — subsample evenly if there are more
            if len(onset_times) > 50:
                step_f = len(onset_times) / 50
                onset_times = np.array([onset_times[int(i * step_f)] for i in range(50)])

            total_time = total_samples / self.sample_rate
            for t in onset_times:
                s_time = max(0.0, t - 0.1)
                e_time = min(total_time, t + 0.4)

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
            logger.warning("Fast onset detection failed: %s", e)

        return chunks
