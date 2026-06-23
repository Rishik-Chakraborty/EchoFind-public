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
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [query, setQuery] = useState<string>("");
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isSearching, setIsSearching] = useState<boolean>(false);

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

  const getStatusClass = (status: string) => {
    if (status === "completed") return "status-completed";
    if (status === "failed") return "status-failed";
    return "status-processing";
  };

  const resolutionColor = (type: string) => {
    switch (type) {
      case "onset": return { bg: "rgba(168, 85, 247, 0.15)", border: "#a855f7", text: "#c084fc" };
      case "250ms": return { bg: "rgba(244, 63, 94, 0.15)", border: "#f43f5e", text: "#fb7185" };
      case "1s": return { bg: "rgba(14, 165, 233, 0.15)", border: "#0ea5e9", text: "#38bdf8" };
      case "2s": return { bg: "rgba(245, 158, 11, 0.15)", border: "#f59e0b", text: "#fbbf24" };
      case "5s": return { bg: "rgba(16, 185, 129, 0.15)", border: "#10b981", text: "#34d399" };
      case "10s": return { bg: "rgba(99, 102, 241, 0.15)", border: "#6366f1", text: "#818cf8" };
      default: return { bg: "rgba(100, 100, 130, 0.15)", border: "#64648280", text: "#a8a3b8" };
    }
  };

  const timelineRangeColor = (type: string) => {
    switch (type) {
      case "onset": return "rgba(168, 85, 247, 0.25)";
      case "250ms": return "rgba(244, 63, 94, 0.25)";
      case "1s": return "rgba(14, 165, 233, 0.25)";
      case "2s": return "rgba(245, 158, 11, 0.25)";
      case "5s": return "rgba(16, 185, 129, 0.25)";
      case "10s": return "rgba(99, 102, 241, 0.25)";
      default: return "rgba(100, 100, 130, 0.2)";
    }
  };

  const timelineBorderColor = (type: string) => {
    switch (type) {
      case "onset": return "#a855f7";
      case "250ms": return "#f43f5e";
      case "1s": return "#0ea5e9";
      case "2s": return "#f59e0b";
      case "5s": return "#10b981";
      case "10s": return "#6366f1";
      default: return "#646482";
    }
  };

  const legendItems = [
    { type: "onset", label: "Onset", color: "#a855f7" },
    { type: "1s", label: "1s", color: "#0ea5e9" },
    { type: "2s", label: "2s", color: "#f59e0b" },
  ];

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Background Orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="grid-overlay" />

      {/* ─── Header ─── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: "1px solid var(--glass-border)",
          background: "rgba(5, 5, 16, 0.75)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 28px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "var(--gradient-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 12,
                color: "#fff",
                letterSpacing: "-0.03em",
                boxShadow: "var(--glow-accent)",
              }}
            >
              EF
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: 17,
                letterSpacing: "-0.02em",
                background: "linear-gradient(135deg, #f0eef6, var(--accent-400))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              EchoFind
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--accent-400)",
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.2)",
                padding: "2px 8px",
                borderRadius: 20,
                fontWeight: 600,
              }}
            >
              v3.1
            </span>
          </div>

          {/* Auth */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }}>
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="btn-primary" style={{ padding: "8px 16px", fontSize: 12 }}>
                  Sign Up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section
        className="animate-fade-in"
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1100,
          margin: "0 auto",
          padding: "80px 28px 40px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 16px",
            borderRadius: 20,
            background: "rgba(168, 85, 247, 0.06)",
            border: "1px solid rgba(168, 85, 247, 0.15)",
            marginBottom: 24,
            fontSize: 12,
            fontWeight: 500,
            color: "var(--accent-400)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-500)", display: "inline-block" }} />
          Powered by LAION-CLAP Neural Embeddings
        </div>

        <h1
          style={{
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            marginBottom: 20,
            background: "linear-gradient(135deg, #fff 0%, var(--accent-400) 50%, var(--accent-500) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Neural Audio Search
        </h1>

        <p
          style={{
            fontSize: "clamp(15px, 2vw, 18px)",
            color: "var(--text-secondary)",
            maxWidth: 560,
            margin: "0 auto 48px",
            lineHeight: 1.6,
          }}
        >
          Upload any audio file, index it with AI, and search through sound using natural language — in seconds.
        </p>
      </section>

      {/* ─── Main Content ─── */}
      <main
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 28px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {/* ─── Section 1: Ingest ─── */}
        <section className="glass-card animate-fade-in animate-delay-1" style={{ padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div className="section-badge">1</div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Ingest Audio Source
            </h2>
          </div>

          <div
            style={{
              padding: 28,
              borderRadius: 16,
              border: "2px dashed rgba(168, 85, 247, 0.15)",
              background: "rgba(168, 85, 247, 0.02)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              transition: "border-color 0.3s, background 0.3s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
              e.currentTarget.style.background = "rgba(168, 85, 247, 0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.15)";
              e.currentTarget.style.background = "rgba(168, 85, 247, 0.02)";
            }}
          >
            {/* Upload Icon */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-400)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 4, fontWeight: 500 }}>
                {file ? file.name : "Drop your audio file here"}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  : "Supports MP3, WAV, FLAC, OGG, and more"}
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <label className="btn-ghost" style={{ cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 4v16m8-8H4" />
                </svg>
                Choose File
                <input type="file" accept="audio/*" onChange={handleFileChange} style={{ display: "none" }} />
              </label>

              {file && (
                <button
                  onClick={handleUpload}
                  disabled={uploadStatus === "uploading" || uploadStatus === "processing"}
                  className="btn-primary"
                >
                  {(uploadStatus === "uploading" || uploadStatus === "processing") && (
                    <svg style={{ animation: "spin 1s linear infinite", width: 14, height: 14 }} fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  Ingest Audio
                </button>
              )}
            </div>
          </div>

          {/* Status Bar */}
          {uploadStatus && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, padding: "0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Pipeline</span>
                <span className={`status-badge ${getStatusClass(uploadStatus)}`}>{uploadStatus}</span>
              </div>
              {elapsedTime > 0 && (
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{elapsedTime}s</span> elapsed
                </span>
              )}
            </div>
          )}
        </section>

        {/* ─── Section 2: Timeline ─── */}
        {audioUrl && (
          <section className="glass-card animate-fade-in animate-delay-2" style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="section-badge">2</div>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Temporal Indexer
                </h2>
              </div>
              {duration > 0 && (
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  {Math.floor(duration / 60)}:{(duration % 60).toFixed(1).padStart(4, "0")}
                </span>
              )}
            </div>

            {/* Audio Player */}
            <div
              style={{
                background: "rgba(5, 5, 16, 0.5)",
                padding: 14,
                borderRadius: 14,
                border: "1px solid var(--glass-border)",
                marginBottom: 20,
              }}
            >
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
                style={{
                  width: "100%",
                  height: 40,
                  filter: "brightness(0.9) contrast(1.1)",
                }}
              />
            </div>

            {/* Interactive Timeline */}
            {duration > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Interactive Timeline
                  </span>
                  <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                    {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
                  </span>
                </div>

                {/* Track */}
                <div
                  onClick={handleTimelineTrackClick}
                  style={{
                    position: "relative",
                    height: 40,
                    width: "100%",
                    background: "rgba(5, 5, 16, 0.6)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: 10,
                    overflow: "hidden",
                    cursor: "pointer",
                    marginBottom: 12,
                  }}
                >
                  {/* Grid lines */}
                  <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "space-between", pointerEvents: "none", opacity: 0.06 }}>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} style={{ width: 1, height: "100%", background: "#fff" }} />
                    ))}
                  </div>

                  {/* Result Ranges */}
                  {results.map((res, index) => {
                    const startPercent = (res.start_time / duration) * 100;
                    const endPercent = (res.end_time / duration) * 100;
                    const widthPercent = Math.max(endPercent - startPercent, 1.0);

                    return (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTimelineClick(res.start_time);
                        }}
                        title={`${res.start_time.toFixed(2)}s – ${res.end_time.toFixed(2)}s (score: ${res.score.toFixed(3)})`}
                        style={{
                          position: "absolute",
                          top: 0,
                          height: "100%",
                          left: `${startPercent}%`,
                          width: `${widthPercent}%`,
                          background: timelineRangeColor(res.resolution_type),
                          borderLeft: `2px solid ${timelineBorderColor(res.resolution_type)}`,
                          cursor: "pointer",
                          border: "none",
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = timelineRangeColor(res.resolution_type).replace("0.25", "0.45");
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = timelineRangeColor(res.resolution_type);
                        }}
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
                      background: "var(--accent-400)",
                      left: `${(currentTime / duration) * 100}%`,
                      zIndex: 20,
                      pointerEvents: "none",
                      transition: "left 0.075s linear",
                      boxShadow: "0 0 8px var(--accent-500)",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -3,
                        left: -4,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "var(--accent-400)",
                        boxShadow: "0 0 10px var(--accent-500)",
                      }}
                    />
                  </div>
                </div>

                {/* Legend */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  <span>0.0s</span>
                  <div style={{ display: "flex", gap: 16 }}>
                    {legendItems.map((item) => (
                      <span key={item.type} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: `${item.color}30`, borderLeft: `2px solid ${item.color}`, display: "inline-block" }} />
                        {item.label}
                      </span>
                    ))}
                  </div>
                  <span>{duration.toFixed(1)}s</span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ─── Section 3: Search ─── */}
        <section className="glass-card animate-fade-in animate-delay-3" style={{ padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div className="section-badge">3</div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Search Soundscape
            </h2>
          </div>

          <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchFile(null);
                  }}
                  placeholder="Search sounds... (e.g. 'bird chirping', 'siren', 'glass shattering')"
                  className="input-glass"
                  style={{ paddingLeft: 40 }}
                />
              </div>

              <label className="btn-ghost" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
                <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {searchFile ? searchFile.name : "Audio Query"}
                </span>
                <input type="file" accept="audio/*" onChange={handleSearchFileChange} style={{ display: "none" }} />
              </label>

              <button type="submit" disabled={isSearching} className="btn-primary">
                {isSearching ? (
                  <>
                    <svg style={{ animation: "spin 1s linear infinite", width: 14, height: 14 }} fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Searching...
                  </>
                ) : (
                  "Search"
                )}
              </button>
            </div>

            {searchFile && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                Audio mode: matching sounds similar to <span style={{ color: "var(--accent-400)" }}>&quot;{searchFile.name}&quot;</span>
              </p>
            )}
          </form>

          {/* Results */}
          {results.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--glass-border)" }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Neural Matches
                </h3>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  {results.length} results
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map((res, idx) => {
                  const rc = resolutionColor(res.resolution_type);
                  return (
                    <button
                      key={idx}
                      onClick={() => handleTimelineClick(res.start_time)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        padding: "14px 20px",
                        borderRadius: 14,
                        background: "rgba(5, 5, 16, 0.3)",
                        border: "1px solid var(--glass-border)",
                        cursor: "pointer",
                        transition: "all 0.25s var(--ease-smooth)",
                        width: "100%",
                        textAlign: "left",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.2)";
                        e.currentTarget.style.background = "rgba(168, 85, 247, 0.04)";
                        e.currentTarget.style.boxShadow = "0 0 20px rgba(168, 85, 247, 0.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--glass-border)";
                        e.currentTarget.style.background = "rgba(5, 5, 16, 0.3)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {/* Resolution Badge */}
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 6,
                          background: rc.bg,
                          border: `1px solid ${rc.border}30`,
                          color: rc.text,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          flexShrink: 0,
                        }}
                      >
                        {res.resolution_type}
                      </span>

                      {/* Time Range */}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{res.start_time.toFixed(2)}s</span>
                        <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>→</span>
                        <span style={{ color: "var(--text-secondary)" }}>{res.end_time.toFixed(2)}s</span>
                      </span>

                      {/* Score */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                          {res.score.toFixed(4)}
                        </span>
                        <div style={{ width: 60, height: 4, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 4,
                              background: `linear-gradient(90deg, ${rc.border}, ${rc.text})`,
                              width: `${Math.min(res.score * 100, 100)}%`,
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                      </div>

                      {/* Seek Arrow */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Spin keyframes (inline for the spinner SVGs) */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
