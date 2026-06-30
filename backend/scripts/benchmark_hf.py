import time
import requests
import os
import sys
import numpy as np
import soundfile as sf
import tempfile

API_URL = "https://rishikchakraborty-echofind-api.hf.space"
# Using the API key from the original environment variables
API_KEY = "***REDACTED***"

def wait_for_wakeup():
    print(f"Pinging {API_URL}/health to wake up the space...")
    start_time = time.time()
    while True:
        try:
            response = requests.get(f"{API_URL}/health", timeout=10)
            if response.status_code == 200:
                elapsed = time.time() - start_time
                print(f"Space is awake! Took {elapsed:.2f} seconds.")
                return
            else:
                print(f"Status code {response.status_code}. Still waking up...")
        except requests.exceptions.RequestException as e:
            print(f"Connection error. Space is likely sleeping/booting. Retrying in 15s...")
        
        time.sleep(15)

def benchmark_hf_space():
    wait_for_wakeup()
    
    duration_s = 60
    sr = 48000
    print(f"\nGenerating {duration_s}s of dummy audio data at {sr}Hz...")
    audio_data = np.random.uniform(-1, 1, size=(int(duration_s * sr),)).astype(np.float32)
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        sf.write(tmp_file.name, audio_data, sr)
        tmp_path = tmp_file.name
    
    try:
        print("\nStarting Upload & Processing Benchmark...")
        headers = {"Authorization": f"Bearer {API_KEY}"}
        
        # 1. Upload
        t0 = time.time()
        with open(tmp_path, "rb") as f:
            files = {"file": ("benchmark.wav", f, "audio/wav")}
            upload_res = requests.post(f"{API_URL}/api/v1/upload", headers=headers, files=files)
        
        if upload_res.status_code != 200:
            print(f"Upload failed: {upload_res.status_code} - {upload_res.text}")
            return
            
        data = upload_res.json()
        job_id = data.get("job_id")
        print(f"Upload successful. Job ID: {job_id}")
        
        # 2. Poll for completion
        print("Polling job status...")
        while True:
            job_res = requests.get(f"{API_URL}/api/v1/jobs/{job_id}", headers=headers)
            if job_res.status_code == 200:
                job_data = job_res.json()
                status = job_data.get("status")
                progress = job_data.get("progress", 0.0)
                
                print(f"Status: {status} | Progress: {progress*100:.1f}%")
                
                if status == "completed":
                    break
                elif status == "failed":
                    print("Job failed on the backend!")
                    return
            else:
                print(f"Error polling: {job_res.status_code} - {job_res.text}")
                
            time.sleep(2)
            
        t_total = time.time() - t0
        rtf = t_total / duration_s
        
        print("\n" + "="*50)
        print("🚀 HUGGING FACE SPACE BENCHMARK RESULTS")
        print("="*50)
        print(f"Total Processing Time for {duration_s}s audio: {t_total:.2f} seconds")
        print(f"Real-Time Factor (RTF): {rtf:.2f}x (Higher is worse)")
        
        # Write results to a file so we can easily read them
        with open("hf_benchmark_results.txt", "w") as f:
            f.write(f"Total Processing Time for {duration_s}s audio: {t_total:.2f} seconds\n")
            f.write(f"Real-Time Factor (RTF): {rtf:.2f}x\n")
            
    finally:
        os.remove(tmp_path)

if __name__ == "__main__":
    benchmark_hf_space()
