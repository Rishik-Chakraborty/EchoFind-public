"use client";

import React, { useState, useRef, useEffect } from "react";

interface SearchResult {
  file_id: number;
  start_time: number;
  end_time: number;
  resolution_type: string;
  score: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Poll job status until completed or failed
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/v1/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setUploadStatus(data.status);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Status poll error:", err);
        setUploadStatus("failed");
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setAudioUrl(URL.createObjectURL(selected));
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadStatus("uploading");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/v1/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setJobId(data.job_id);
      setUploadStatus(data.status);
    } catch (err) {
      console.error(err);
      setUploadStatus("failed");
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setIsSearching(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query }),
      });
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTimelineClick = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      audioRef.current.play();
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl mb-12 text-center sm:text-left">
        <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-500">
          EchoFind <span className="text-sm font-normal text-neutral-400 px-2 py-1 rounded bg-neutral-900 border border-neutral-800 ml-2">v3.1</span>
        </h1>
        <p className="text-neutral-400 mt-2 text-sm">Control + F for audio. Neural audio retrieval powered by LAION-CLAP.</p>
      </header>

      <main className="w-full max-w-4xl space-y-8">
        {/* Upload Zone */}
        <section className="bg-neutral-900/50 backdrop-blur-md border border-neutral-800 rounded-2xl p-6 transition hover:border-teal-500/30">
          <h2 className="text-lg font-semibold mb-4 text-neutral-200">1. Upload Audio File</h2>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-teal-500/10 file:text-teal-400 hover:file:bg-teal-500/20 cursor-pointer"
            />
            {file && (
              <button
                onClick={handleUpload}
                disabled={uploadStatus === "uploading" || uploadStatus === "processing"}
                className="w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-neutral-950 font-bold rounded-full transition disabled:opacity-50"
              >
                Ingest Audio
              </button>
            )}
          </div>
          {uploadStatus && (
            <p className="mt-3 text-xs text-neutral-400">
              Status: <span className="capitalize font-semibold text-teal-400">{uploadStatus}</span>
            </p>
          )}
        </section>

        {/* Audio Player and Visual Timeline */}
        {audioUrl && (
          <section className="bg-neutral-900/50 backdrop-blur-md border border-neutral-800 rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-semibold text-neutral-200">2. Interactive Timeline</h2>
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
              className="w-full"
            />

            {duration > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-neutral-400">Search highlights mapping:</label>
                {/* Visual Timeline track */}
                <div className="relative h-6 w-full bg-neutral-800 rounded-md overflow-hidden border border-neutral-700">
                  {results.map((res, index) => {
                    const startPercent = (res.start_time / duration) * 100;
                    const endPercent = (res.end_time / duration) * 100;
                    const widthPercent = Math.max(endPercent - startPercent, 1.5); // Ensure min width visible
                    
                    // Style coloring based on resolution size
                    let color = "bg-teal-400/60 hover:bg-teal-300";
                    if (res.resolution_type === "250ms") color = "bg-rose-500/80 hover:bg-rose-400";
                    if (res.resolution_type === "2s") color = "bg-amber-400/70 hover:bg-amber-300";

                    return (
                      <button
                        key={index}
                        onClick={() => handleTimelineClick(res.start_time)}
                        className={`absolute top-0 h-full ${color} transition cursor-pointer group`}
                        style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                        title={`Jump to ${res.start_time.toFixed(1)}s (${res.resolution_type}) - Score: ${res.score.toFixed(3)}`}
                      >
                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-neutral-950 text-[10px] text-neutral-200 px-2 py-1 rounded border border-neutral-800 opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none mb-1">
                          {res.start_time.toFixed(1)}s - {res.end_time.toFixed(1)}s
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-neutral-500">
                  <span>0.0s</span>
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500"></span> 250ms (Transients)</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-400"></span> 2s (Speech)</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-teal-400"></span> 5s (Ambient)</span>
                  </div>
                  <span>{duration.toFixed(1)}s</span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Search Bar */}
        <section className="bg-neutral-900/50 backdrop-blur-md border border-neutral-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-neutral-200">3. Search Soundscape</h2>
          <form onSubmit={handleSearch} className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. 'glass breaking', 'laughter', 'sirens'..."
              className="flex-1 px-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl focus:outline-none focus:border-teal-500 text-sm text-neutral-200"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="px-6 py-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 font-bold rounded-xl transition text-sm disabled:opacity-50"
            >
              {isSearching ? "Searching..." : "Find"}
            </button>
          </form>

          {/* Results List */}
          {results.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-400">Top Neural Matches:</h3>
              <div className="grid gap-2">
                {results.map((res, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleTimelineClick(res.start_time)}
                    className="flex justify-between items-center p-3 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 rounded-xl cursor-pointer transition"
                  >
                    <div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                        {res.resolution_type}
                      </span>
                      <span className="text-sm ml-3 text-neutral-200">
                        Timestamp: <span className="font-bold text-teal-400">{res.start_time.toFixed(1)}s</span> - {res.end_time.toFixed(1)}s
                      </span>
                    </div>
                    <span className="text-xs text-neutral-400 font-mono">
                      Distance: {res.score.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
