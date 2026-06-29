"use client";

import React, { useState, useRef, useEffect } from "react";
import { Show, RedirectToSignIn, UserButton } from "@clerk/nextjs";

interface SearchResult {
  file_id: number;
  filename: string;
  start_time: number;
  end_time: number;
  resolution_type: string;
  score: number;
}

// Minimal Icons
const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const WaveformIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 7v10" /><path d="M22 10v4" /><path d="M7 7v10" /><path d="M2 10v4" /></svg>;
const UploadCloudIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>;

const Panel = ({ title, badge, children, className = "" }: { title: string, badge?: string, children: React.ReactNode, className?: string }) => (
  <div className={`glass-panel overflow-hidden flex flex-col relative z-10 ${className}`}>
    <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 shrink-0 bg-white/[0.01]">
      <h2 className="text-sm font-bold text-white tracking-wide uppercase">{title}</h2>
      {badge && <span className="bg-white/10 text-white px-2 py-1 rounded text-xs font-semibold">{badge}</span>}
    </div>
    <div className="flex-1 overflow-hidden p-6 relative">
      {children}
    </div>
  </div>
);

export default function Dashboard() {
  return (
    <>
      <Show when="signed-in">
        <DashboardContent />
      </Show>
      <Show when="signed-out">
        <RedirectToSignIn />
      </Show>
    </>
  );
}

function DashboardContent() {
  const [ingestionType, setIngestionType] = useState<"none" | "single" | "corpus">("none");
  const [ingestionStatus, setIngestionStatus] = useState<"idle" | "uploading" | "processing" | "completed" | "failed">("idle");
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [activeJobs, setActiveJobs] = useState<number[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [currentFileId, setCurrentFileId] = useState<number | null>(null);
  const [query, setQuery] = useState<string>("");
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Poll job status
  const [indexingProgress, setIndexingProgress] = useState<number>(0);

  useEffect(() => {
    if (activeJobs.length === 0 || ingestionStatus !== "processing") return;
    
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const statuses = await Promise.all(
          activeJobs.map(async (id) => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/jobs/${id}`, {
              headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_KEY}` },
            });
            if (!res.ok) return { id, status: "failed", progress: 0.0, file_id: null };
            const data = await res.json();
            return { id, status: data.status, progress: data.progress || 0.0, file_id: data.file_id };
          })
        );
        
        if (!isMounted) return;

        const completedCount = statuses.filter(s => s.status === "completed").length;
        const failedCount = statuses.filter(s => s.status === "failed").length;
        
        // Calculate average progress across all active jobs (scale to percentage 0-100)
        const avgProgress = statuses.reduce((acc, curr) => acc + curr.progress, 0) / statuses.length;
        setIndexingProgress(Math.round(avgProgress * 100));
        
        setUploadProgress(`Processing files: ${completedCount}/${statuses.length} completed (${Math.round(avgProgress * 100)}%)`);

        if (completedCount + failedCount === statuses.length) {
          clearInterval(interval);
          if (failedCount > 0) {
            setIngestionStatus("failed");
          } else {
            setIndexingProgress(100);
            setIngestionStatus("completed");
            // If it's a single file upload, set the currentFileId
            if (ingestionType === "single" && statuses.length === 1) {
              setCurrentFileId(statuses[0].file_id);
            }
          }
        }
      } catch (err) {
        console.error("Error polling jobs:", err);
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeJobs, ingestionStatus, ingestionType]);

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

  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setIngestionType("single");
      setIngestionStatus("uploading");
      setUploadedFiles([selected.name]);
      setUploadProgress("Uploading file to server...");
      
      const formData = new FormData();
      formData.append("file", selected);
      
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload`, {
          method: "POST",
          headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_KEY}` },
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        
        setCurrentFileName(selected.name);
        setAudioUrl(URL.createObjectURL(selected));
        setDuration(0);
        setCurrentTime(0);
        setResults([]);
        setHasSearched(false);
        
        setActiveJobs([data.job_id]);
        setIngestionStatus("processing");
        setUploadProgress("Processing file: 0/1 completed");
      } catch (err) {
        console.error("Upload error:", err);
        setIngestionStatus("failed");
      }
    }
  };

  const handleCorpusFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setIngestionType("corpus");
      setIngestionStatus("uploading");
      setUploadedFiles(selectedFiles.map(f => f.name));
      
      const jobIds: number[] = [];
      let uploadedCount = 0;
      
      for (const f of selectedFiles) {
        setUploadProgress(`Uploading files: ${uploadedCount}/${selectedFiles.length}`);
        const formData = new FormData();
        formData.append("file", f);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload`, {
            method: "POST",
            headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_KEY}` },
            body: formData,
          });
          if (!res.ok) throw new Error("Upload failed");
          const data = await res.json();
          jobIds.push(data.job_id);
          uploadedCount++;
        } catch (err) {
          console.error("Failed to upload corpus file:", f.name, err);
        }
      }
      
      if (jobIds.length > 0) {
        setActiveJobs(jobIds);
        setIngestionStatus("processing");
        setUploadProgress(`Processing files: 0/${jobIds.length} completed`);
      } else {
        setIngestionStatus("failed");
      }
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
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/search/audio`, {
          method: "POST",
          headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_KEY}` },
          body: formData,
        });
      } else {
        const body: { text: string; file_id?: number } = { text: query };
        if (ingestionType === "single" && currentFileId !== null) {
          body.file_id = currentFileId;
        }
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_API_KEY}` },
          body: JSON.stringify(body),
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

  const handleTimelineClick = (res: SearchResult) => {
    if (currentFileId !== res.file_id) {
       setCurrentFileId(res.file_id);
       setCurrentFileName(res.filename);
       setAudioUrl(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/audio/${res.file_id}`);
       if (audioRef.current) {
         audioRef.current.dataset.pendingSeek = res.start_time.toString();
       }
    } else {
       if (audioRef.current) {
         audioRef.current.currentTime = res.start_time;
         audioRef.current.play().catch(() => {});
       }
    }
  };

  const handleReset = () => {
    setIngestionType("none");
    setIngestionStatus("idle");
    setUploadedFiles([]);
    setActiveJobs([]);
    setUploadProgress("");
    setCurrentFileName(null);
    setCurrentFileId(null);
    setQuery("");
    setResults([]);
    setAudioUrl(null);
    setDuration(0);
    setCurrentTime(0);
    setHasSearched(false);
    setIsSearching(false);
  };

  const formatTime = (seconds: number) => {
    return new Date(seconds * 1000).toISOString().substring(14, 22);
  };

  return (
    <div className="min-h-screen w-screen bg-[#050505] text-zinc-300 font-sans overflow-x-hidden relative selection:bg-white selection:text-black">
      <div className="liquid-bg"></div>

      {/* ─── HEADER ─── */}
      <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 max-w-[1400px] mx-auto relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white flex items-center justify-center text-black font-bold text-sm rounded-full shadow-[0_0_15px_rgba(255,255,255,0.3)]">EF</div>
          <span className="font-bold text-white tracking-tight text-lg">EchoFind</span>
        </div>
        <div className="flex items-center gap-6">
          {ingestionType !== "none" && (
            <button 
              onClick={handleReset} 
              className="text-xs font-semibold px-4 py-2 border border-white/10 rounded-full hover:bg-white/5 hover:border-white/20 transition-all text-zinc-300"
            >
              Index New Audio
            </button>
          )}
          <UserButton />
        </div>
      </header>

      {/* ─── MAIN CONTENT CONTAINER ─── */}
      <main className="max-w-[1400px] mx-auto px-8 py-12 relative z-10 min-h-[calc(100vh-5rem)] flex flex-col">
        
        {/* STEP 1: INITIAL STATE (CHOOSE INGESTION TYPE) */}
        {ingestionType === "none" && (
          <div className="flex-1 flex flex-col justify-center items-center py-10">
            <div className="text-center mb-16 max-w-2xl animate-fade-in">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/15 bg-white/5 text-xs font-semibold text-zinc-200 mb-6 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                CLAP Vector Indexer Active
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-4 leading-tight">
                Neural Sound Retrieval
              </h1>
              <p className="text-zinc-400 text-lg leading-relaxed">
                Encode waveforms directly into a unified 512-dimensional vector space using Multi-Modal Contrastive Learning. Search your audio assets using natural language.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
              {/* Singular File Ingestion Card */}
              <div className="glass-panel p-10 flex flex-col justify-between items-center text-center group hover:bg-white/[0.04] transition-all border border-white/10 relative overflow-hidden">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 group-hover:bg-white/10 transition-colors border border-white/5">
                  <WaveformIcon />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Index Singular File</h2>
                <p className="text-zinc-400 text-sm mb-10 leading-relaxed max-w-xs">
                  Upload a single file. You will be able to search the file content and seek to results on a visual audio timeline.
                </p>
                <label className="cursor-pointer bg-white text-black px-8 py-3 rounded-full text-sm font-bold hover:bg-zinc-200 transition-colors shadow-lg w-full block">
                  Select Audio File
                  <input type="file" accept="audio/*" onChange={handleSingleFileChange} className="hidden" />
                </label>
              </div>
              
              {/* Corpus Ingestion Card */}
              <div className="glass-panel p-10 flex flex-col justify-between items-center text-center group hover:bg-white/[0.04] transition-all border border-white/10 relative overflow-hidden">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 group-hover:bg-white/10 transition-colors border border-white/5">
                  <UploadCloudIcon />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Index Audio Corpus</h2>
                <p className="text-zinc-400 text-sm mb-10 leading-relaxed max-w-xs">
                  Upload multiple audio assets. The system constructs a bulk vector index so you can perform search across all files.
                </p>
                <label className="cursor-pointer bg-white text-black px-8 py-3 rounded-full text-sm font-bold hover:bg-zinc-200 transition-colors shadow-lg w-full block">
                  Select Multiple Files
                  <input type="file" multiple accept="audio/*" onChange={handleCorpusFilesChange} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PROCESSING LOADER */}
        {(ingestionStatus === "uploading" || ingestionStatus === "processing") && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="max-w-xl w-full glass-panel p-10 flex flex-col items-center text-center border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-zinc-800 via-white to-zinc-800 animate-pulse"></div>
              
              <div className="relative w-20 h-20 mb-8 mt-4">
                <span className="absolute inset-0 border-4 border-white/10 rounded-full"></span>
                <span className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin"></span>
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
                {ingestionStatus === 'uploading' ? 'Uploading Audio Target...' : 'Generating Acoustic Vectors...'}
              </h2>
              <p className="text-zinc-400 text-sm mb-6 max-w-sm leading-relaxed">
                {ingestionStatus === 'uploading' 
                  ? 'Streaming audio fragments to the ingestion engine.'
                  : 'Librosa is extracting waveforms while the LAION-CLAP neural network compiles 512D spatial coordinates.'}
              </p>

              {/* Visual Progress Bar */}
              {ingestionStatus === 'processing' && (
                <div className="w-full max-w-md bg-white/5 border border-white/10 h-3.5 rounded-full mb-6 overflow-hidden relative">
                  <div 
                    className="bg-white h-full transition-all duration-500 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                    style={{ width: `${indexingProgress}%` }}
                  ></div>
                </div>
              )}
              
              <div className="bg-white/5 border border-white/5 px-6 py-2.5 rounded-full font-mono text-xs text-zinc-300">
                {uploadProgress || 'Initializing pipeline...'}
              </div>
              
              {uploadedFiles.length > 0 && (
                <div className="mt-10 text-left w-full border-t border-white/5 pt-6 max-h-40 overflow-y-auto custom-scrollbar">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">File Ingestion Queue:</span>
                  <ul className="text-xs text-zinc-400 mt-3 space-y-2">
                    {uploadedFiles.map((name, i) => (
                      <li key={i} className="truncate flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span> {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: COMPLETED INGESTION - SHOWING SEARCH AND RESULTS */}
        {ingestionStatus === "completed" && (
          <div className="flex-1 flex flex-col gap-10">
            
            {/* Search Input Section */}
            <div className="glass-panel p-8 border border-white/10 w-full max-w-3xl mx-auto shadow-xl">
              <h2 className="text-xl font-bold text-white mb-2 text-center tracking-tight">
                {ingestionType === "single" ? "Search within Audio File" : "Search Audio Corpus"}
              </h2>
              <p className="text-zinc-400 text-xs text-center mb-6 max-w-md mx-auto">
                {ingestionType === "single"
                  ? `Search inside "${currentFileName}". Matches will be highlighted on the visual timeline.`
                  : `Search across the indexed corpus of ${uploadedFiles.length} files.`}
              </p>
              
              <form onSubmit={handleSearch} className="w-full flex items-center bg-white/5 border border-white/10 rounded-full px-5 py-3 hover:bg-white/10 hover:border-white/20 transition-all focus-within:border-white/30 focus-within:bg-white/10">
                <SearchIcon />
                <input 
                  value={query} 
                  onChange={e => { setQuery(e.target.value); setSearchFile(null); }} 
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(e); }}
                  placeholder="Ask for a sound (e.g., 'dog barking', 'camera click', 'background laughter')..." 
                  className="bg-transparent border-none outline-none ml-4 text-zinc-200 placeholder-zinc-500 text-sm w-full"
                />
                <button type="submit" className="hidden">Search</button>
              </form>
            </div>

            {/* Results Grid layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
              
              {/* Left Column: Player (only shown if a file is loaded or if we are in single file mode) */}
              {(ingestionType === "single" || audioUrl) && (
                <div className={`${ingestionType === "single" ? "lg:col-span-8" : "lg:col-span-7"} w-full`}>
                  <Panel title="Acoustic Player" className="w-full">
                    <div className="flex flex-col gap-6">
                      <div className="flex justify-between items-center p-4 rounded-xl bg-white/5 border border-white/10">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center border border-white/20 shrink-0">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate pr-4" title={currentFileName || ""}>
                              {currentFileName}
                            </div>
                            <div className="text-xs text-zinc-500 mt-0.5">
                              {ingestionType === "single" ? "Single target file" : "Corpus sound query result"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <audio
                        ref={audioRef}
                        src={audioUrl!}
                        controls
                        className="hidden"
                        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                        onCanPlay={() => {
                          if (audioRef.current?.dataset.pendingSeek) {
                            audioRef.current.currentTime = parseFloat(audioRef.current.dataset.pendingSeek);
                            delete audioRef.current.dataset.pendingSeek;
                            audioRef.current.play().catch(() => {});
                          }
                        }}
                        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                      />

                      {/* Timeline / Waveform Box */}
                      <div className="relative h-32 rounded-xl border border-white/10 bg-black overflow-hidden group">
                        {/* Waveform Representation */}
                        <div className="absolute inset-0 flex items-center px-4 gap-0.5 opacity-25">
                          {[...Array(80)].map((_, i) => (
                            <div 
                              key={i} 
                              className="flex-1 bg-white rounded-full" 
                              style={{ height: `${Math.max(10, Math.abs(Math.sin(i * 0.2)) * 100)}%` }}
                            ></div>
                          ))}
                        </div>

                        {/* Match Highlights */}
                        {duration > 0 && results.filter(r => currentFileId === null || r.file_id === currentFileId).map((res, i) => (
                          <div 
                            key={i}
                            style={{
                              position: "absolute",
                              left: `${(res.start_time / duration) * 100}%`,
                              width: `${Math.max(((res.end_time - res.start_time) / duration) * 100, 1.2)}%`,
                              height: "100%",
                              backgroundColor: "rgba(255, 255, 255, 0.12)",
                              borderLeft: "2px solid rgba(255, 255, 255, 0.7)",
                              borderRight: "2px solid rgba(255, 255, 255, 0.7)",
                              borderRadius: "4px"
                            }}
                          />
                        ))}

                        {/* Playhead */}
                        {duration > 0 && (
                          <div 
                            style={{
                              position: "absolute",
                              left: `${(currentTime / duration) * 100}%`,
                              top: 0, bottom: 0,
                              width: "2px",
                              backgroundColor: "#fff",
                              boxShadow: "0 0 10px rgba(255,255,255,0.8)"
                            }}
                          >
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full"></div>
                          </div>
                        )}
                      </div>

                      {duration > 0 && (
                        <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
                          <span>{formatTime(currentTime)}</span>
                          <button 
                            onClick={() => {
                              if(audioRef.current?.paused) audioRef.current?.play().catch(()=>{});
                              else audioRef.current?.pause();
                            }} 
                            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-colors shadow-xl"
                          >
                            {isPlaying ? "❚❚" : "▶"}
                          </button>
                          <span>{formatTime(duration)}</span>
                        </div>
                      )}
                    </div>
                  </Panel>
                </div>
              )}

              {/* Right Column: Search Results */}
              <div className={`${(ingestionType === "single" || audioUrl) ? (ingestionType === "single" ? "lg:col-span-4" : "lg:col-span-5") : "lg:col-span-12 max-w-4xl mx-auto"} w-full h-[520px] flex flex-col`}>
                <Panel title="Acoustic Matches" badge={results.length > 0 ? `${results.length} Events` : undefined} className="h-full flex-1">
                  <div className="h-full overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-3">
                    {isSearching && (
                      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-sm font-mono tracking-wider">RETRIEVING NEURAL MATCHES...</p>
                      </div>
                    )}

                    {!isSearching && results.length === 0 && hasSearched && (
                      <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center p-6">
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                          <SearchIcon />
                        </div>
                        <p className="text-sm">No vector matches found above the similarity thresholds.</p>
                      </div>
                    )}

                    {!isSearching && results.length === 0 && !hasSearched && (
                      <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center p-6">
                        <p className="text-sm leading-relaxed max-w-xs">
                          {ingestionType === "single" 
                            ? "Submit a text description of a sound to discover matching fragments in this file."
                            : "Submit a query to scan the database vectors and identify similar sounds across all files."}
                        </p>
                      </div>
                    )}

                    {!isSearching && results.map((res, idx) => (
                      <div 
                        key={idx} 
                        className={`bg-white/[0.02] border rounded-xl p-4 cursor-pointer hover:bg-white/[0.05] hover:border-white/20 transition-all group ${currentFileId === res.file_id ? 'border-white/35 bg-white/[0.05]' : 'border-white/5'}`} 
                        onClick={() => handleTimelineClick(res)}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center font-bold text-xs border border-white/10 shrink-0">
                              {idx + 1}
                            </div>
                            <span className="text-sm font-semibold text-white truncate max-w-[160px]" title={res.filename}>{res.filename}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-zinc-500 font-medium">Confidence</span>
                            <span className="text-xs font-bold text-emerald-400">{((1 - res.score) * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 bg-black/45 rounded-lg p-2.5 border border-white/5">
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5">Resolution</span>
                            <span className="text-[11px] text-zinc-300 capitalize">{res.resolution_type}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5">Timestamp</span>
                            <span className="text-[11px] text-zinc-300 font-mono">{formatTime(res.start_time)} - {formatTime(res.end_time)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

            </div>

            {/* CORPUS CLUSTERING MAP COMMENTED OUT FOR NOW, TO BE ADDED LATER
            <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto min-h-0 mt-8">
              <div className="flex justify-between items-center bg-white/[0.02] border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
                 <div>
                   <h2 className="text-xl font-bold text-white mb-1">Corpus-Level Clustering Map</h2>
                   <p className="text-sm text-zinc-400">Interactive 3D projection of indexed chunks via PCA and K-Means.</p>
                 </div>
              </div>
              <div className="h-[400px] bg-white/[0.01] border border-white/5 rounded-2xl overflow-hidden relative shadow-inner">
                 <Plot ... />
              </div>
            </div>
            */}

          </div>
        )}
        
        {/* INGESTION PIPELINE FAILURE STATE */}
        {ingestionStatus === "failed" && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="max-w-md w-full glass-panel p-8 border border-destructive/20 text-center shadow-2xl">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6 mx-auto border border-destructive/30">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Ingestion Pipeline Failed</h2>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                An error occurred during file upload or neural indexing. Check if the backend API server and PostgreSQL database are online.
              </p>
              <button 
                onClick={handleReset}
                className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-colors shadow-lg w-full"
              >
                Retry Setup
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
