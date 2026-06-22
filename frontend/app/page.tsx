"use client";

import React, { useState, useRef, useEffect } from "react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

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
  const [currentTime, setCurrentTime] = useState<number>(0);
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
      // Reset temporal stats
      setDuration(0);
      setCurrentTime(0);
      setResults([]);
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
      audioRef.current.play().catch((err) => console.log("Playback play error:", err));
    }
  };

  const handleTimelineTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPercent = clickX / rect.width;
    const targetTime = clickPercent * duration;
    
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans antialiased">
      {/* Header Navbar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded bg-zinc-100 text-zinc-950 font-black text-xs tracking-tighter">
              EF
            </div>
            <span className="font-semibold tracking-tight text-zinc-100 text-sm">EchoFind</span>
            <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900/50 border border-zinc-800 px-1.5 py-0.5 rounded">
              v3.1
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-zinc-400 font-medium hidden sm:block">
              Neural Temporal-Spatial Audio Retrieval
            </div>
            <Show when="signed-out">
              <div className="flex items-center gap-2">
                <SignInButton mode="modal">
                  <button className="text-xs font-medium text-zinc-300 hover:text-zinc-50 transition border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 rounded-md cursor-pointer">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="text-xs font-medium text-zinc-950 transition border border-zinc-100 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-md cursor-pointer">
                    Sign Up
                  </button>
                </SignUpButton>
              </div>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      {/* Main Console */}
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Section 1: Ingest Audio Source */}
        <section className="bg-zinc-900/30 border border-zinc-900 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">1</span>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ingest Audio Source</h2>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-md border border-dashed border-zinc-800 bg-zinc-950/20 hover:border-zinc-800 transition duration-150">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-medium px-4 py-2 rounded text-xs transition flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Choose File
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <span className="text-xs text-zinc-400 font-mono truncate max-w-xs md:max-w-md">
                {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : "No file selected"}
              </span>
            </div>
            
            {file && (
              <button
                onClick={handleUpload}
                disabled={uploadStatus === "uploading" || uploadStatus === "processing"}
                className="w-full md:w-auto px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold rounded transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {(uploadStatus === "uploading" || uploadStatus === "processing") && (
                  <svg className="animate-spin h-3.5 w-3.5 text-zinc-950" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                Ingest Audio
              </button>
            )}
          </div>

          {uploadStatus && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-zinc-500">Pipeline Status:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wider ${
                uploadStatus === "completed" 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : uploadStatus === "failed"
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
              }`}>
                {uploadStatus}
              </span>
            </div>
          )}
        </section>

        {/* Section 2: Audio Player & Interactive Timeline */}
        {audioUrl && (
          <section className="bg-zinc-900/30 border border-zinc-900 rounded-lg p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">2</span>
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Temporal Indexer Mapping</h2>
              </div>
              {duration > 0 && (
                <span className="text-xs font-mono text-zinc-400">
                  Duration: {Math.floor(duration / 60)}:{(duration % 60).toFixed(1).padStart(4, "0")}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {/* Audio player element */}
              <div className="bg-zinc-950/40 p-3 rounded border border-zinc-900/80 flex items-center justify-center">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                  onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                  onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
                  className="w-full brightness-90 contrast-125 saturate-50 accent-zinc-200"
                />
              </div>

              {duration > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs text-zinc-400">
                    <span>Interactive Timeline (click track to seek)</span>
                    <span className="font-mono text-zinc-300">
                      Playhead: {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
                    </span>
                  </div>

                  {/* Seeker Track */}
                  <div 
                    onClick={handleTimelineTrackClick}
                    className="relative h-8 w-full bg-zinc-950 border border-zinc-900 rounded-md overflow-hidden cursor-pointer select-none group/timeline"
                  >
                    {/* Subtle grid lines */}
                    <div className="absolute inset-0 flex justify-between pointer-events-none opacity-10">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-full w-[1px] bg-zinc-500" />
                      ))}
                    </div>

                    {/* Result Ranges */}
                    {results.map((res, index) => {
                      const startPercent = (res.start_time / duration) * 100;
                      const endPercent = (res.end_time / duration) * 100;
                      const widthPercent = Math.max(endPercent - startPercent, 1.0);

                      let colorClass = "bg-zinc-400/20 hover:bg-zinc-400/35 border-zinc-400";
                      if (res.resolution_type === "250ms") colorClass = "bg-rose-500/20 hover:bg-rose-500/35 border-rose-500";
                      else if (res.resolution_type === "1s") colorClass = "bg-sky-500/20 hover:bg-sky-500/35 border-sky-500";
                      else if (res.resolution_type === "2s") colorClass = "bg-amber-500/20 hover:bg-amber-500/35 border-amber-500";
                      else if (res.resolution_type === "5s") colorClass = "bg-emerald-500/20 hover:bg-emerald-500/35 border-emerald-500";
                      else if (res.resolution_type === "10s") colorClass = "bg-indigo-500/20 hover:bg-indigo-500/35 border-indigo-500";

                      return (
                        <button
                          key={index}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTimelineClick(res.start_time);
                          }}
                          className={`absolute top-0 h-full border-l-2 ${colorClass} transition duration-150 cursor-pointer group/match`}
                          style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                        >
                          <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 px-2 py-1 rounded shadow-lg opacity-0 group-hover/match:opacity-100 transition duration-150 whitespace-nowrap pointer-events-none mb-1.5 z-30 font-mono">
                            {res.start_time.toFixed(2)}s – {res.end_time.toFixed(2)}s (score: {res.score.toFixed(3)})
                          </span>
                        </button>
                      );
                    })}

                    {/* Dynamic Playhead */}
                    <div 
                      className="absolute top-0 bottom-0 w-[2px] bg-zinc-100 z-20 pointer-events-none transition-all duration-75"
                      style={{ left: `${(currentTime / duration) * 100}%` }}
                    >
                      {/* Playhead node */}
                      <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5 bg-zinc-100 border border-zinc-950 rounded-full shadow" />
                    </div>
                  </div>

                  {/* Resolution Types Legend */}
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                    <span>0.0s</span>
                    <div className="flex gap-4">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm bg-rose-500/25 border-l border-rose-500" />
                        <span>250ms (Transients)</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm bg-sky-500/25 border-l border-sky-500" />
                        <span>1s (Short Events)</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm bg-amber-500/25 border-l border-amber-500" />
                        <span>2s (Speech)</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm bg-emerald-500/25 border-l border-emerald-500" />
                        <span>5s (Ambient)</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm bg-indigo-500/25 border-l border-indigo-500" />
                        <span>10s (Native)</span>
                      </span>
                    </div>
                    <span>{duration.toFixed(1)}s</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Section 3: Search Dashboard */}
        <section className="bg-zinc-900/30 border border-zinc-900 rounded-lg p-6 space-y-6">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">3</span>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Search Spatial Soundscape</h2>
          </div>

          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search query (e.g. 'squeaks', 'siren', 'glass shattering')..."
                className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-900 focus:border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-850 transition font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-semibold rounded text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </form>

          {/* Matches List Grid/Table */}
          {results.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Top Neural Vector Matches</h3>
                <span className="text-[10px] font-mono text-zinc-500">{results.length} matches</span>
              </div>

              <div className="overflow-x-auto rounded border border-zinc-900 bg-zinc-950/20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[10px] uppercase font-mono text-zinc-500 tracking-wider bg-zinc-900/10">
                      <th className="px-4 py-2 font-medium">Resolution</th>
                      <th className="px-4 py-2 font-medium">Temporal Range</th>
                      <th className="px-4 py-2 font-medium">Confidence (Distance)</th>
                      <th className="px-4 py-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60 font-mono text-xs">
                    {results.map((res, idx) => {
                      let resolutionBadge = "border-zinc-800 bg-zinc-900/40 text-zinc-400";
                      if (res.resolution_type === "250ms") resolutionBadge = "border-rose-500/20 bg-rose-500/5 text-rose-400";
                      else if (res.resolution_type === "1s") resolutionBadge = "border-sky-500/20 bg-sky-500/5 text-sky-400";
                      else if (res.resolution_type === "2s") resolutionBadge = "border-amber-500/20 bg-amber-500/5 text-amber-400";
                      else if (res.resolution_type === "5s") resolutionBadge = "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
                      else if (res.resolution_type === "10s") resolutionBadge = "border-indigo-500/20 bg-indigo-500/5 text-indigo-400";

                      return (
                        <tr 
                          key={idx}
                          onClick={() => handleTimelineClick(res.start_time)}
                          className="hover:bg-zinc-900/20 transition cursor-pointer group"
                        >
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wide ${resolutionBadge}`}>
                              {res.resolution_type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-zinc-200">
                            <span className="font-semibold text-zinc-100">{res.start_time.toFixed(2)}s</span>
                            <span className="text-zinc-500 mx-1.5">to</span>
                            <span>{res.end_time.toFixed(2)}s</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-300 tabular-nums">
                                {res.score.toFixed(4)}
                              </span>
                              <div className="w-16 h-1 bg-zinc-900 rounded-full overflow-hidden hidden sm:block">
                                <div 
                                  className="h-full bg-zinc-500 rounded-full group-hover:bg-zinc-400 transition" 
                                  style={{ width: `${Math.min(res.score * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button className="text-[10px] border border-zinc-800 group-hover:border-zinc-700 bg-zinc-900 text-zinc-400 group-hover:text-zinc-200 px-2 py-0.5 rounded transition cursor-pointer">
                              Seek
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
