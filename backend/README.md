---
title: EchoFind API
emoji: 🎵
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
hardware: t4-small
---

# EchoFind API

This is the FastAPI backend for EchoFind, running on a Hugging Face Space with a T4 NVIDIA GPU.
All audio ingestion (CLAP embedding + Whisper ASR) and semantic search run on the GPU — no local processing required.
