# EchoFind Hardware Benchmarks

This document outlines the performance benchmarks for the EchoFind neural sound retrieval system across different hardware environments. The primary bottleneck in the system is running inference for two large deep learning models:
1. **LAION-CLAP (`laion/clap-htsat-fused`)**: Generates 512-dimensional acoustic vectors.
2. **Faster-Whisper (`tiny`)**: Generates timestamped speech-to-text transcriptions.

## Benchmark Methodology
- **Input File:** 60 seconds of randomly generated white noise (`sr=48000`).
- **Metric:** Real-Time Factor (RTF). An RTF of 1.0x means 60 seconds of audio takes 60 seconds to process. Lower is better.
- **Overhead:** Includes chunking the audio into 2-second fragments using `librosa`.

---

## 1. Hugging Face Free Tier (Standard CPU)
*The default deployment environment for the backend API.*

Because the Hugging Face Free Tier lacks a GPU or matrix multiplication acceleration, processing is handled entirely by standard CPU cores. This results in severe bottlenecks during the embedding and transcription phases.

- **CLAP + Whisper Inference:** ~66.11 seconds
- **Total Processing Time:** 66.11 seconds
- **Real-Time Factor (RTF):** **1.10x**

**Conclusion:** Unsuitable for real-time indexing. A 10-minute audio file takes over 11 minutes to process, resulting in a degraded user experience.

---

## 2. Local Apple Silicon (MPS Acceleration)
*Tested on a local M-Series Mac using PyTorch's Metal Performance Shaders (MPS).*

Apple's unified memory architecture and built-in GPU acceleration provide a massive speedup for transformer-based models.

- **CLAP Inference:** 1.78 seconds
- **Whisper Inference:** 1.73 seconds
- **Total Processing Time:** 3.51 seconds
- **Real-Time Factor (RTF):** **0.06x**

**Conclusion:** Excellent performance. The pipeline runs nearly 20 times faster than a standard CPU.

---

## 3. NVIDIA T4 Small (Current Production Hardware)
*The active deployment environment for the backend API.*

NVIDIA T4 GPUs (with 16GB VRAM) are highly optimized for inference workloads. With CUDA and CTranslate2 optimizations for Faster-Whisper, the processing times drop to fractions of a second.

- **CLAP Inference:** ~0.5 - 1.0 seconds
- **Whisper Inference:** ~0.6 - 1.2 seconds
- **CPU Overhead (Librosa):** ~1.0 - 1.5 seconds
- **Total Processing Time:** **2.5 - 4.0 seconds**
- **Real-Time Factor (RTF):** **~0.05x**

**Conclusion:** A T4 GPU provides a **~15x to 20x speedup** compared to the free CPU tier. A 10-minute audio clip that currently takes 11 minutes to index on the free tier will be completely processed and searchable in just **30 to 40 seconds**. This hardware is absolutely critical for deploying EchoFind to production.
