import os
import logging
from typing import List
import numpy as np
import torch
from transformers import CLIPModel, CLIPProcessor

# Silence noisy transformers warnings
logging.getLogger("transformers").setLevel(logging.ERROR)

class ClapEmbedder:
    """Singleton wrapper around the LAION‑CLAP model.

    - Loads the model on CPU (or Apple M‑series ``mps`` if available).
    - Provides ``embed_audio_batch`` for a list of ``np.ndarray`` chunks.
    - Provides ``embed_text_query`` for a natural‑language query string.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        # Choose device: MPS (Apple Silicon) > CPU
        if torch.backends.mps.is_available():
            self.device = torch.device("mps")
        else:
            self.device = torch.device("cpu")
        # Load model and processor; using the HuggingFace CLAP checkpoint
        model_name = "laion/clap-htsat-fused"
        self.model = CLIPModel.from_pretrained(model_name).to(self.device)
        self.processor = CLIPProcessor.from_pretrained(model_name)
        self.model.eval()

    def embed_audio_batch(self, chunk_arrays: List[np.ndarray]) -> np.ndarray:
        """Encode a list of audio numpy arrays into a (N, 512) ndarray.
        The CLAP model expects a batch dimension and a mono waveform.
        """
        # Convert to list of torch tensors on the correct device
        audio_tensors = [torch.from_numpy(arr).float().to(self.device) for arr in chunk_arrays]
        # Pad/stack – CLAP can handle variable lengths via the processor
        inputs = self.processor(audio=audio_tensors, sampling_rate=48000, return_tensors="pt", padding=True)
        with torch.no_grad():
            embeddings = self.model.get_audio_features(**inputs)
        # Normalize to unit length (as CLAP does)
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings.cpu().numpy()

    def embed_text_query(self, text: str) -> np.ndarray:
        """Encode a text query into a (1, 512) ndarray."""
        inputs = self.processor(text=[text], return_tensors="pt")
        with torch.no_grad():
            embeddings = self.model.get_text_features(**inputs)
        embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
        return embeddings.cpu().numpy()[0]
