import time
import os
import sys
import numpy as np
import librosa
from pathlib import Path

# Add the src directory to the path so we can import the core modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.core.embedder import ClapEmbedder
from src.core.indexer import get_whisper_model

def generate_dummy_audio(duration_seconds=60, sr=48000):
    """Generate white noise audio as a numpy array."""
    print(f"Generating {duration_seconds}s of dummy audio data...")
    # Generate random noise between -1 and 1
    audio = np.random.uniform(-1, 1, size=(int(duration_seconds * sr),)).astype(np.float32)
    return audio, sr

def run_benchmarks():
    print("="*50)
    print("🚀 ECHO FIND INFERENCE BENCHMARK")
    print("="*50)
    
    # 1. Initialize models (measure load time)
    print("\n[1/3] Loading Models into Memory...")
    
    t0 = time.time()
    embedder = ClapEmbedder()
    t_clap_load = time.time() - t0
    print(f"✅ LAION-CLAP loaded in {t_clap_load:.2f} seconds. (Device: {embedder.device})")
    
    t0 = time.time()
    whisper_model = get_whisper_model()
    t_whisper_load = time.time() - t0
    print(f"✅ Faster-Whisper loaded in {t_whisper_load:.2f} seconds.")
    
    # 2. Prepare Data
    duration_s = 60
    audio_data, sr = generate_dummy_audio(duration_s)
    
    # Chunk audio for CLAP (simulating the AudioFragmenter behavior: e.g., 2-second chunks)
    # 48000 sr * 2 seconds = 96000 samples per chunk
    chunk_size = sr * 2
    chunks = [audio_data[i:i+chunk_size] for i in range(0, len(audio_data), chunk_size)]
    
    print(f"\n[2/3] Benchmarking CLAP Embedding ({duration_s}s audio -> {len(chunks)} chunks)...")
    t0 = time.time()
    
    # Batch process in chunks of 16 like the production indexer might
    batch_size = 16
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i+batch_size]
        _ = embedder.embed_audio_batch(batch)
        
    t_clap_infer = time.time() - t0
    clap_rtf = t_clap_infer / duration_s
    print(f"⏱️ CLAP Inference Time: {t_clap_infer:.2f} seconds")
    print(f"📊 Real-Time Factor (RTF): {clap_rtf:.2f}x (Lower is better)")
    
    print(f"\n[3/3] Benchmarking Whisper Transcription ({duration_s}s audio)...")
    # Write to a temporary file since WhisperModel.transcribe expects a file path or binary stream
    import tempfile
    import soundfile as sf
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        sf.write(tmp_file.name, audio_data, sr)
        tmp_path = tmp_file.name
        
    try:
        t0 = time.time()
        segments, info = whisper_model.transcribe(tmp_path, word_timestamps=True, vad_filter=True)
        # Force evaluation of the generator to actually run the transcription
        list(segments)
        t_whisper_infer = time.time() - t0
        whisper_rtf = t_whisper_infer / duration_s
        print(f"⏱️ Whisper Inference Time: {t_whisper_infer:.2f} seconds")
        print(f"📊 Real-Time Factor (RTF): {whisper_rtf:.2f}x (Lower is better)")
    finally:
        os.remove(tmp_path)
        
    print("\n" + "="*50)
    print("📈 BENCHMARK SUMMARY")
    print("="*50)
    print(f"Total Processing Time for {duration_s}s audio: {t_clap_infer + t_whisper_infer:.2f} seconds")
    print(f"Combined RTF: {clap_rtf + whisper_rtf:.2f}x")
    if (clap_rtf + whisper_rtf) > 0.5:
        print("\n⚠️ CONCLUSION: The system is running too slow for a seamless real-time user experience.")
        print("   A GPU (e.g. T4 or A10G) would massively accelerate matrix multiplications for both")
        print("   transformers, bringing processing times down to fractions of a second.")
    else:
        print("\n✅ Performance is acceptable on current hardware.")

if __name__ == "__main__":
    run_benchmarks()
