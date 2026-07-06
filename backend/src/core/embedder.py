import os
import logging
import threading
import time
from typing import List
import numpy as np
import torch
from transformers import ClapModel, AutoProcessor

# Silence noisy transformers warnings
logging.getLogger("transformers").setLevel(logging.ERROR)

# Prevent HuggingFace tokenizers from spawning sub-processes, which deadlock
# inside uvicorn's background thread pool.
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

# Set a download timeout so from_pretrained() never hangs indefinitely
# when HF servers are slow or partially responsive.
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")

torch.set_num_threads(4)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Retry helper for HuggingFace model downloads
# ---------------------------------------------------------------------------
_MAX_RETRIES = 3
_RETRY_BACKOFF = 15  # seconds between retries


def _load_with_retry(load_fn, description: str, max_retries: int = _MAX_RETRIES):
    """Call *load_fn()* up to *max_retries* times with exponential backoff.

    Catches the broad set of exceptions that ``from_pretrained`` can raise
    when the HF Hub is unreachable, rate-limited, or returns a bad response.
    """
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            return load_fn()
        except (OSError, ConnectionError, TimeoutError, ValueError) as exc:
            last_error = exc
            if attempt < max_retries:
                wait = _RETRY_BACKOFF * attempt
                logger.warning(
                    "%s failed (attempt %d/%d): %s — retrying in %ds",
                    description, attempt, max_retries, exc, wait,
                )
                time.sleep(wait)
            else:
                logger.error(
                    "%s failed after %d attempts: %s",
                    description, max_retries, exc,
                )
    raise RuntimeError(
        f"Failed to load {description} after {max_retries} attempts"
    ) from last_error


class ClapEmbedder:
    """Singleton wrapper around the LAION-CLAP model.

    Uses the ``laion/clap-htsat-fused`` variant which produces 
    superior embeddings for pure environmental sounds (birds, sirens, etc).

    - Uses CUDA (FP16) when available on NVIDIA GPUs for maximum throughput.
    - Falls back to CPU (FP32) otherwise.
    - MPS (Apple Silicon) is intentionally skipped — CLAP has known
      memory allocation bugs on MPS.
    - Provides ``embed_audio_batch`` for a list of ``np.ndarray`` chunks.
    - Provides ``embed_text_query`` for a single natural-language string.
    - Provides ``embed_text_batch`` for encoding many phrases in one pass.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                instance = super().__new__(cls)
                instance._initialize()
                cls._instance = instance
            return cls._instance

    def _initialize(self):
        # Use CUDA if available on NVIDIA GPUs, otherwise CPU.
        # MPS (Apple Silicon) is intentionally skipped — CLAP has known
        # memory allocation bugs on MPS that cause silent embedding
        # corruption and sporadic crashes.
        if torch.cuda.is_available():
            self.device = torch.device("cuda")
            # FP16 on CUDA: T4 Tensor Cores give ~2× throughput vs FP32 with
            # negligible accuracy loss (embeddings are L2-normalised anyway).
            self.dtype = torch.float16
        else:
            self.device = torch.device("cpu")
            # FP16 is slower than FP32 on CPU — keep full precision.
            self.dtype = torch.float32

        logger.info(
            "ClapEmbedder initializing on %s (%s).",
            self.device, "fp16" if self.dtype == torch.float16 else "fp32",
        )

        model_name = "laion/clap-htsat-fused"

        self.model = _load_with_retry(
            lambda: ClapModel.from_pretrained(model_name).to(self.device, dtype=self.dtype),
            f"CLAP model ({model_name})",
        )
        self.processor = _load_with_retry(
            lambda: AutoProcessor.from_pretrained(model_name),
            f"CLAP processor ({model_name})",
        )
        self.model.eval()
        logger.info("ClapEmbedder ready on %s.", self.device)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _to_device(self, inputs: dict) -> dict:
        """Move processor outputs to device, casting floats to model dtype."""
        return {
            k: v.to(self.device, dtype=self.dtype) if v.dtype == torch.float32 else v.to(self.device)
            for k, v in inputs.items()
        }

    # ------------------------------------------------------------------
    # Audio embedding
    # ------------------------------------------------------------------

    def _embed_audio_single_batch(self, arrays: List[np.ndarray]) -> np.ndarray:
        """Embed a single batch (internal — no OOM fallback)."""
        inputs = self.processor(
            audios=arrays,
            sampling_rate=48000,
            return_tensors="pt",
            padding=True,
        )
        inputs = self._to_device(inputs)
        with torch.inference_mode():
            out = self.model.get_audio_features(**inputs)
        # get_audio_features may return a BaseModelOutputWithPooling or a
        # plain tensor depending on the transformers version.
        embeddings = out.pooler_output if hasattr(out, 'pooler_output') else out
        # Cast back to FP32 before normalising (FP16 norms can be imprecise)
        embeddings = embeddings.float()
        # L2-normalise to unit sphere (standard for cosine similarity)
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings.cpu().numpy()

    def embed_audio_batch(self, chunk_arrays: List[np.ndarray]) -> np.ndarray:
        """Encode a list of audio numpy arrays into a (N, 512) ndarray.

        Includes OOM protection: if a batch triggers an out-of-memory error,
        the batch is automatically halved and retried recursively, down to
        single-item batches as a last resort.
        """
        arrays = [arr.astype(np.float32) for arr in chunk_arrays]

        try:
            return self._embed_audio_single_batch(arrays)
        except (RuntimeError, torch.cuda.OutOfMemoryError) as exc:
            if len(arrays) <= 1:
                # Single item still OOMs — nothing we can do, propagate
                raise
            logger.warning(
                "OOM on batch of %d — splitting in half and retrying: %s",
                len(arrays), exc,
            )
            # Clear CUDA cache if using GPU
            if self.device.type == "cuda":
                torch.cuda.empty_cache()

            mid = len(arrays) // 2
            left = self.embed_audio_batch(arrays[:mid])
            right = self.embed_audio_batch(arrays[mid:])
            return np.concatenate([left, right], axis=0)

    # ------------------------------------------------------------------
    # Text embedding
    # ------------------------------------------------------------------

    def embed_text_batch(self, texts: List[str]) -> np.ndarray:
        """Encode a list of text strings into an (N, 512) ndarray.

        All phrases are run through the text encoder in **one forward pass**,
        which is far more efficient than calling ``embed_text_query`` N times
        (saves N−1 kernel launch overheads and CPU↔GPU round-trips).
        Use this for query ensemble embedding at search time.
        """
        inputs = self.processor(text=texts, return_tensors="pt", padding=True)
        inputs = self._to_device(inputs)
        with torch.inference_mode():
            out = self.model.get_text_features(**inputs)
        embeddings = out.pooler_output if hasattr(out, 'pooler_output') else out
        embeddings = embeddings.float()
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings.cpu().numpy()

    def embed_text_query(self, text: str) -> np.ndarray:
        """Encode a single text query into a (512,) ndarray.

        For embedding multiple phrases, prefer ``embed_text_batch`` to
        avoid redundant forward passes.
        """
        return self.embed_text_batch([text])[0]
