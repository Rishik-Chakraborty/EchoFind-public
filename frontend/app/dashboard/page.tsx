"use client";

import React, { useState, useRef, useEffect } from "react";
import { Show, SignInButton, SignUpButton, UserButton, RedirectToSignIn } from "@clerk/nextjs";

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
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [query, setQuery] = useState<string>("");
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [lastQuery, setLastQuery] = useState<string>("");
  const [waveConfig, setWaveConfig] = useState<{delay: string, duration: string, maxH: number}[]>([]);
  const [showUpgradeLimit, setShowUpgradeLimit] = useState<boolean>(false);

  useEffect(() => {
    // Generate stable values for the equalizer only on the client
    setWaveConfig([...Array(12)].map(() => ({
      delay: -(Math.random() * 2).toFixed(2),
      duration: (0.5 + Math.random() * 0.5).toFixed(2),
      maxH: 40 + Math.random() * 60
    })));
  }, []);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Timer effect for ingestion
  useEffect(() => {
    let timerInterval: NodeJS.Timeout;
    if ((uploadStatus === "uploading" || uploadStatus === "processing") && uploadStartTime) {
      timerInterval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - uploadStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [uploadStatus, uploadStartTime]);

  // Poll job status
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

  // Audio Event Listeners to animate waves
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    
    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [audioUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      
      // Enforce 10MB free plan limit
      if (selected.size > 10 * 1024 * 1024) {
        setFile(null);
        setAudioUrl(null);
        setShowUpgradeLimit(true);
        return;
      }
      
      setShowUpgradeLimit(false);
      setFile(selected);
      setAudioUrl(URL.createObjectURL(selected));
      setDuration(0);
      setCurrentTime(0);
      setResults([]);
    }
  };

  const handleSearchFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSearchFile(e.target.files[0]);
      setQuery("");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadStatus("uploading");
    setUploadStartTime(Date.now());
    setElapsedTime(0);
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
    if (!query && !searchFile) return;
    setIsSearching(true);
    setLastQuery(query);
    try {
      let res;
      if (searchFile) {
        const formData = new FormData();
        formData.append("file", searchFile);
        res = await fetch("http://127.0.0.1:8000/api/v1/search/audio", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("http://127.0.0.1:8000/api/v1/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: query }),
        });
      }
      const data = await res.json();
      setResults(data);
      setHasSearched(true);
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

  // Helper for timeline resolution colors
  const resolutionColor = (type: string) => {
    switch (type) {
      case "onset": return { bg: "var(--primary)", border: "var(--primary)" };
      case "1s": return { bg: "var(--muted-foreground)", border: "var(--muted-foreground)" };
      case "2s": return { bg: "var(--border)", border: "var(--border)" };
      default: return { bg: "var(--secondary)", border: "var(--secondary)" };
    }
  };

  return (
    <>
      <Show when="signed-in">
        <div style={{ minHeight: "100vh", paddingBottom: "4rem" }}>
          {/* ─── Header Navigation ─── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "rgba(253, 253, 253, 0.8)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary-foreground)", fontWeight: 700, fontSize: 12 }}>
              EF
            </div>
            <span style={{ fontWeight: 600, fontSize: 16 }}>EchoFind</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="btn btn-ghost">Log In</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="btn btn-primary">Sign Up</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: 32 }}>
        
        {/* ─── Dashboard Header & Visualizer ─── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em", marginBottom: 8 }}>Audio Search</h1>
            <p style={{ color: "var(--muted-foreground)", fontSize: 15 }}>Upload audio, index the soundscape, and triage events through natural language.</p>
          </div>
          
          {/* Sound Waves Visualizer */}
          <div className="sound-wave-container" title={isPlaying ? "Audio playing" : "Audio idle"}>
            {waveConfig.map((config, i) => (
              <div 
                key={i} 
                className={`wave-bar ${(!isPlaying && !isSearching && uploadStatus !== "uploading") ? "idle" : ""}`}
                style={{
                  animationDelay: `${config.delay}s`,
                  animationDuration: `${config.duration}s`,
                  height: isPlaying ? `${config.maxH}%` : undefined
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr lg:1fr", gap: 32, alignItems: "start" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 32, flex: 1 }}>
            
            {/* ─── Card 1: Ingestion Panel ─── */}
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">1. Ingest Audio</h2>
                <p className="card-description">Upload an audio file to index its neural features.</p>
              </div>
              <div className="card-content">
                <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, backgroundColor: "var(--background)" }}>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>
                    {file ? file.name : "Select an audio file to begin indexing"}
                  </p>
                  
                  <div style={{ display: "flex", gap: 12 }}>
                    <label className="btn btn-outline">
                      Choose File
                      <input type="file" accept="audio/*" onChange={handleFileChange} style={{ display: "none" }} />
                    </label>

                    {file && (
                      <button onClick={handleUpload} disabled={uploadStatus === "uploading" || uploadStatus === "processing"} className="btn btn-primary">
                        {(uploadStatus === "uploading" || uploadStatus === "processing") ? "Processing..." : "Index Audio"}
                      </button>
                    )}
                  </div>
                  
                  {showUpgradeLimit && (
                    <div style={{ marginTop: 8, padding: 16, backgroundColor: "var(--destructive)", color: "var(--destructive-foreground)", borderRadius: "var(--radius)", fontSize: 14, textAlign: "center" }}>
                      <strong>File too large!</strong> The free plan has a 10MB limit.<br />
                      To process more, email <a href="mailto:rishikchak2008@gmail.com" style={{ textDecoration: "underline" }}>rishikchak2008@gmail.com</a>.
                    </div>
                  )}
                </div>

                {uploadStatus && (
                  <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                    <span style={{ color: "var(--muted-foreground)" }}>Status:</span>
                    <span className={`badge ${uploadStatus === "completed" ? "badge-success" : uploadStatus === "failed" ? "badge-destructive" : "badge-secondary"}`}>
                      {uploadStatus}
                    </span>
                    {elapsedTime > 0 && <span style={{ color: "var(--muted-foreground)" }}>{elapsedTime}s</span>}
                  </div>
                )}
              </div>
            </section>

            {/* ─── Card 2: Timeline Panel ─── */}
            {audioUrl && (
              <section className="card">
                <div className="card-header">
                  <h2 className="card-title">2. Temporal Viewer</h2>
                  <p className="card-description">Scrub through the indexed audio file and view matched ranges.</p>
                </div>
                <div className="card-content">
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    controls
                    onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                    onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                    onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
                    style={{ width: "100%", height: 36, marginBottom: 24 }}
                  />

                  {duration > 0 && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
                        <span>0:00</span>
                        <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{(currentTime).toFixed(2)}s / {(duration).toFixed(2)}s</span>
                      </div>

                      <div
                        onClick={handleTimelineTrackClick}
                        style={{
                          position: "relative",
                          height: 48,
                          width: "100%",
                          backgroundColor: "var(--secondary)",
                          borderRadius: "var(--radius)",
                          overflow: "hidden",
                          cursor: "pointer",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {/* Interactive Timeline Track */}
                        {results.map((res, index) => {
                          const startPercent = (res.start_time / duration) * 100;
                          const endPercent = (res.end_time / duration) * 100;
                          const widthPercent = Math.max(endPercent - startPercent, 0.5);
                          const rc = resolutionColor(res.resolution_type);

                          return (
                            <div
                              key={index}
                              onClick={(e) => { e.stopPropagation(); handleTimelineClick(res.start_time); }}
                              title={`${res.start_time.toFixed(2)}s - Score: ${res.score.toFixed(3)}`}
                              style={{
                                position: "absolute",
                                top: 0,
                                height: "100%",
                                left: `${startPercent}%`,
                                width: `${widthPercent}%`,
                                backgroundColor: rc.bg,
                                opacity: 0.6,
                                borderLeft: `2px solid ${rc.border}`,
                                transition: "opacity 0.2s",
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"}
                            />
                          );
                        })}

                        {/* Playhead */}
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            width: 2,
                            backgroundColor: "var(--foreground)",
                            left: `${(currentTime / duration) * 100}%`,
                            pointerEvents: "none",
                            zIndex: 10,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            
            {/* ─── Card 3: Search Panel ─── */}
            <section className="card">
              <div className="card-header" style={{ paddingBottom: 16 }}>
                <h2 className="card-title">3. Triage Search</h2>
                <p className="card-description">Query the soundscape using text or an audio file reference.</p>
              </div>
              <div className="card-content">
                <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSearchFile(null); }}
                    placeholder="e.g. 'glass shattering', 'birds chirping'..."
                    className="input"
                  />
                  
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <button type="submit" disabled={isSearching} className="btn btn-primary">
                      {isSearching ? "Searching..." : "Search Audio"}
                    </button>
                    
                    <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>or</span>

                    <label className="btn btn-ghost" style={{ padding: "0 8px" }}>
                      {searchFile ? searchFile.name : "Upload Audio Query"}
                      <input type="file" accept="audio/*" onChange={handleSearchFileChange} style={{ display: "none" }} />
                    </label>
                  </div>
                </form>
              </div>

                  {results.length > 0 ? (
                    <div className="border-t border-[var(--border)]">
                      <div className="flex items-center border-b border-[var(--border)] px-4 py-3 bg-[var(--muted)] text-[var(--muted-foreground)] text-xs font-medium uppercase tracking-wider">
                        <div className="w-1/4">Resolution</div>
                        <div className="w-2/5">Time Range</div>
                        <div className="w-1/5">Match Score</div>
                        <div className="w-[15%] text-right">Action</div>
                      </div>
                      
                      <div className="flex flex-col">
                        {results.map((res, idx) => (
                          <div key={idx} className="flex items-center border-b border-[var(--border)] px-4 py-3 hover:bg-[var(--muted)] transition-colors text-sm">
                            <div className="w-1/4 font-mono text-[var(--muted-foreground)]">
                              <span className="badge badge-outline">{res.resolution_type}</span>
                            </div>
                            <div className="w-2/5 font-medium">
                              {res.start_time.toFixed(2)}s — {res.end_time.toFixed(2)}s
                            </div>
                            <div className="w-1/5 font-mono text-[var(--muted-foreground)]">
                              {(res.score * 100).toFixed(1)}%
                            </div>
                            <div className="w-[15%] text-right">
                              <button onClick={() => handleTimelineClick(res.start_time)} className="btn btn-ghost h-7 px-2 text-xs">
                                Seek
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : hasSearched ? (
                    <div className="p-8 text-center text-[var(--muted-foreground)] border-t border-[var(--border)]">
                      No audio matches found for "{lastQuery || searchFile?.name}". Try adjusting your query.
                    </div>
                  ) : null}
            </section>
          </div>
        </div>

      </main>
    </div>
      </Show>
      <Show when="signed-out">
        <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
           <SignInButton mode="modal">
              <button className="btn btn-primary" style={{ padding: "0 2rem", height: "3rem", fontSize: "1rem" }}>Please Log In to Access the Dashboard</button>
           </SignInButton>
        </div>
      </Show>
    </>
  );
}
