import os
import logging
from typing import List
import numpy as np
import torch
from transformers import ClapModel, AutoProcessor

# Silence noisy transformers warnings
logging.getLogger("transformers").setLevel(logging.ERROR)

# Prevent HuggingFace tokenizers from spawning sub-processes, which deadlock
# inside uvicorn's background thread pool.
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


class ClapEmbedder:
    """Singleton wrapper around the LAION-CLAP model.

    - Loads the model on CPU (or Apple M-series ``mps`` if available).
    - Provides ``embed_audio_batch`` for a list of ``np.ndarray`` chunks.
    - Provides ``embed_text_query`` for a natural-language query string.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        # Force CPU; MPS has known memory allocation bugs with CLAP
        self.device = torch.device("cpu")
        model_name = "laion/clap-htsat-fused"
        self.model = ClapModel.from_pretrained(model_name).to(self.device)
        self.processor = AutoProcessor.from_pretrained(model_name)
        self.model.eval()

    def embed_audio_batch(self, chunk_arrays: List[np.ndarray]) -> np.ndarray:
        """Encode a list of audio numpy arrays into a (N, 512) ndarray.

        NOTE: The transformers ClapProcessor API changed `audios=` → `audio=`.
        We pass raw waveforms as a list; the processor handles padding.
        """
        # Processor expects a list of 1-D float32 arrays
        arrays = [arr.astype(np.float32) for arr in chunk_arrays]
        # Use `audio=` (not `audios=`) — renamed in transformers >= 4.40
        inputs = self.processor(
            audio=arrays,
            sampling_rate=48000,
            return_tensors="pt",
            padding=True,
        )
        # Move all tensors to device
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            out = self.model.get_audio_features(**inputs)
        # get_audio_features returns BaseModelOutputWithPooling in newer transformers;
        # pooler_output is the correct (N, 512) projected embedding.
        embeddings = out.pooler_output if hasattr(out, 'pooler_output') else out
        # L2-normalise to unit sphere (standard for cosine similarity)
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings.cpu().numpy()

    def embed_text_query(self, text: str) -> np.ndarray:
        """Encode a text query into a (512,) ndarray."""
        inputs = self.processor(text=[text], return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.no_grad():
            out = self.model.get_text_features(**inputs)
        embeddings = out.pooler_output if hasattr(out, 'pooler_output') else out
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings.cpu().numpy()[0]
