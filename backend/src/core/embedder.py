import os
import logging
import threading
from typing import List
import numpy as np
import torch
from transformers import ClapModel, AutoProcessor

# Silence noisy transformers warnings
logging.getLogger("transformers").setLevel(logging.ERROR)

# Prevent HuggingFace tokenizers from spawning sub-processes, which deadlock
# inside uvicorn's background thread pool.
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

torch.set_num_threads(os.cpu_count() or 4)


class ClapEmbedder:
    """Singleton wrapper around the LAION-CLAP model.

    Uses the ``laion/clap-htsat-fused`` variant which produces 
    superior embeddings for pure environmental sounds (birds, sirens, etc).

    - Loads the model on CPU (MPS has known memory allocation bugs with CLAP).
    - Provides ``embed_audio_batch`` for a list of ``np.ndarray`` chunks.
    - Provides ``embed_text_query`` for a natural-language query string.
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
        # Use CUDA if available on NVIDIA GPUs, MPS on Apple Silicon, otherwise fallback to CPU
        if torch.cuda.is_available():
            self.device = torch.device("cuda")
        elif torch.backends.mps.is_available():
            self.device = torch.device("mps")
        else:
            self.device = torch.device("cpu")
        print(f"ClapEmbedder initialized with {self.device} device.")
        model_name = "laion/clap-htsat-fused"
        self.model = ClapModel.from_pretrained(model_name).to(self.device)
        self.processor = AutoProcessor.from_pretrained(model_name)
        self.model.eval()

    def embed_audio_batch(self, chunk_arrays: List[np.ndarray]) -> np.ndarray:
        """Encode a list of audio numpy arrays into a (N, 512) ndarray.

        The processor handles padding/truncation internally.  We pass raw
        waveforms as a list of 1-D float32 arrays.
        """
        arrays = [arr.astype(np.float32) for arr in chunk_arrays]
        inputs = self.processor(
            audio=arrays,
            sampling_rate=48000,
            return_tensors="pt",
            padding=True,
        )
        # Move all tensors to device
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.inference_mode():
            out = self.model.get_audio_features(**inputs)
        # get_audio_features may return a BaseModelOutputWithPooling or a
        # plain tensor depending on the transformers version.
        embeddings = out.pooler_output if hasattr(out, 'pooler_output') else out
        # L2-normalise to unit sphere (standard for cosine similarity)
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings.cpu().numpy()

    def embed_text_query(self, text: str) -> np.ndarray:
        """Encode a text query into a (512,) ndarray."""
        inputs = self.processor(text=[text], return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.inference_mode():
            out = self.model.get_text_features(**inputs)
        embeddings = out.pooler_output if hasattr(out, 'pooler_output') else out
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings.cpu().numpy()[0]
