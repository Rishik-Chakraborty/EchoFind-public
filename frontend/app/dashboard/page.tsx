"use client";

import React, { useState, useRef, useEffect } from "react";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import dynamic from 'next/dynamic';

const Plot = dynamic(() => import('react-plotly.js'), { 
  ssr: false, 
  loading: () => <div className="animate-pulse flex items-center justify-center h-full w-full bg-white/[0.02] rounded-2xl border border-white/5"><p className="text-zinc-500 font-mono text-sm tracking-widest">INITIALIZING WEBGL ENGINE...</p></div>
});

interface SearchResult {
  file_id: number;
  start_time: number;
  end_time: number;
  resolution_type: string;
  score: number;
}

interface CorpusDataPoint {
  id: number;
  file_id: number;
  start_time: number;
  end_time: number;
  resolution_type: string;
  x: number;
  y: number;
  z: number;
  cluster: number;
  is_outlier: boolean;
}

// Minimal Icons
const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const SettingsIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const LayersIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>;
const WaveformIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 7v10" /><path d="M22 10v4" /><path d="M7 7v10" /><path d="M2 10v4" /></svg>;
const UploadCloudIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>;

const NavItem = ({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick?: () => void }) => (
  <div onClick={onClick} className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors ${active ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'}`}>
    {icon}
    <span>{label}</span>
  </div>
);

const Panel = ({ title, badge, children, className = "" }: { title: string, badge?: string | number, children: React.ReactNode, className?: string }) => (
  <div className={`border border-white/10 bg-white/[0.02] rounded-2xl flex flex-col shadow-2xl backdrop-blur-xl ${className}`}>
    <div className="h-14 border-b border-white/5 flex items-center justify-between px-6">
      <h2 className="text-sm font-semibold text-white tracking-tight">{title}</h2>
      {badge !== undefined && (
        <div className="bg-white/10 px-2.5 py-1 text-xs font-medium text-white rounded-full">
          {badge}
        </div>
      )}
    </div>
    <div className="flex-1 overflow-hidden relative p-6">
      {children}
    </div>
  </div>
);

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [query, setQuery] = useState<string>("");
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("search");
  
  // Corpus Map State
  const [corpusData, setCorpusData] = useState<CorpusDataPoint[]>([]);
  const [isLoadingCorpus, setIsLoadingCorpus] = useState(false);
  
  // Suppress linter unused warnings for visual elements
  const [_elapsedTime, setElapsedTime] = useState<number>(0);
  const [_isSearching, setIsSearching] = useState<boolean>(false);
  const [_isPlaying, setIsPlaying] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Corpus Map Fetch
  useEffect(() => {
    let active = true;
    if (activeTab === "index" && corpusData.length === 0 && !isLoadingCorpus) {
      const fetchData = async () => {
        setIsLoadingCorpus(true);
        try {
          const res = await fetch("http://127.0.0.1:8000/api/v1/corpus/map");
          const data = await res.json();
          if (active) {
            setCorpusData(data);
            setIsLoadingCorpus(false);
          }
        } catch (err) {
          console.error(err);
          if (active) setIsLoadingCorpus(false);
        }
      };
      // To satisfy react-hooks/set-state-in-effect, we push the state update to the next tick
      setTimeout(fetchData, 0);
    }
    return () => { active = false; };
  }, [activeTab, corpusData.length, isLoadingCorpus]);

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
        setUploadStatus("failed");
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId]);

  useEffect(() => {
    let timerInterval: NodeJS.Timeout;
    if ((uploadStatus === "uploading" || uploadStatus === "processing") && uploadStartTime) {
      timerInterval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - uploadStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [uploadStatus, uploadStartTime]);

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
      setFile(selected);
      setAudioUrl(URL.createObjectURL(selected));
      setDuration(0);
      setCurrentTime(0);
      setResults([]);
      setHasSearched(false);
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
      const res = await fetch("http://127.0.0.1:8000/api/v1/upload", { method: "POST", body: formData });
      const data = await res.json();
      setJobId(data.job_id);
      setUploadStatus(data.status);
    } catch (err) {
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
        res = await fetch("http://127.0.0.1:8000/api/v1/search/audio", { method: "POST", body: formData });
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
      audioRef.current.play().catch(() => {});
    }
  };

  const formatTime = (seconds: number) => {
    return new Date(seconds * 1000).toISOString().substring(14, 22);
  };

  const getCorpusTraces = () => {
    const traces: any[] = [];
    if (corpusData.length > 0) {
      const clusters = Array.from(new Set(corpusData.map(d => d.cluster)));
      const colorPalette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
      
      clusters.forEach((c: number, idx) => {
         const clusterPoints = corpusData.filter(d => d.cluster === c && !d.is_outlier);
         traces.push({
            x: clusterPoints.map(d => d.x),
            y: clusterPoints.map(d => d.y),
            z: clusterPoints.map(d => d.z),
            mode: 'markers',
            type: 'scatter3d',
            name: `Semantic Cluster ${c}`,
            text: clusterPoints.map(d => `Res: ${d.resolution_type}<br>Time: ${d.start_time.toFixed(2)}s`),
            hoverinfo: 'text',
            marker: { size: 4, color: colorPalette[idx % colorPalette.length], opacity: 0.8 }
         });
      });
      
      const outliers = corpusData.filter(d => d.is_outlier);
      if (outliers.length > 0) {
         traces.push({
            x: outliers.map(d => d.x),
            y: outliers.map(d => d.y),
            z: outliers.map(d => d.z),
            mode: 'markers',
            type: 'scatter3d',
            name: 'Outliers / Corrupted',
            text: outliers.map(d => `OUTLIER<br>Res: ${d.resolution_type}<br>Time: ${d.start_time.toFixed(2)}s`),
            hoverinfo: 'text',
            marker: { size: 6, color: '#ef4444', symbol: 'diamond', line: { color: '#ffffff', width: 1 } }
         });
      }
    }
    return traces;
  };

  return (
    <>
      <Show when="signed-in">
        <div className="h-screen w-screen flex bg-[#050505] text-zinc-300 font-sans overflow-hidden selection:bg-white selection:text-black">
          
          {/* ─── SIDEBAR ─── */}
          <aside className="w-64 border-r border-white/5 bg-[#050505] flex flex-col justify-between shrink-0">
            <div>
              <div className="h-16 flex items-center px-6">
                <div className="w-6 h-6 bg-white flex items-center justify-center text-black font-bold text-xs rounded-full mr-3 shadow-[0_0_15px_rgba(255,255,255,0.3)]">EF</div>
                <span className="font-semibold text-white tracking-tight">EchoFind</span>
              </div>
              <div className="p-4 pt-4">
                <nav className="flex flex-col gap-1">
                  <NavItem active={activeTab === "search"} onClick={() => setActiveTab("search")} icon={<SearchIcon />} label="Search" />
                  <NavItem active={activeTab === "index"} onClick={() => setActiveTab("index")} icon={<LayersIcon />} label="Corpus Index" />
                  <NavItem active={activeTab === "strategy"} onClick={() => setActiveTab("strategy")} icon={<WaveformIcon />} label="Audio Strategy" />
                </nav>
              </div>
            </div>
            <div className="p-4">
               <NavItem active={false} icon={<SettingsIcon />} label="Settings" />
               <div className="mt-6 flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/5">
                 <UserButton />
                 <div className="flex flex-col">
                   <span className="text-sm font-medium text-white">Workspace</span>
                   <span className="text-xs text-zinc-500">Pro Plan</span>
                 </div>
               </div>
            </div>
          </aside>

          {/* ─── MAIN CONTENT ─── */}
          <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#050505] relative">
            <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-white opacity-[0.02] blur-[120px] rounded-full pointer-events-none"></div>

            {/* Topbar */}
            <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 shrink-0 relative z-10">
               <div className="flex-1 flex items-center">
                 <form onSubmit={handleSearch} className="w-full max-w-xl flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 hover:bg-white/10 hover:border-white/20 transition-colors focus-within:border-white/30 focus-within:bg-white/10">
                   <SearchIcon />
                   <input 
                     value={query} onChange={e=>{setQuery(e.target.value); setSearchFile(null);}} 
                     onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(e); }}
                     placeholder="Search audio concepts, events, or upload a reference file..." 
                     className="bg-transparent border-none outline-none ml-3 text-zinc-200 placeholder-zinc-500 text-sm w-full"
                   />
                   <button type="submit" className="hidden">Search</button>
                 </form>
               </div>
               <div className="flex justify-end items-center gap-4">
                 <button type="button" className="bg-white text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                   Upload Corpus
                 </button>
               </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 p-8 overflow-y-auto relative z-10">
               {activeTab === "search" && (
                 <div className="flex flex-col gap-8 h-full max-w-[1600px] mx-auto pb-4">
                  
                  {/* TOP ROW: AUDIO SOURCE */}
                  <div className="flex-shrink-0 h-[45%]">
                     <Panel title="Audio Source" className="h-full">
                        <div className="h-full flex flex-col gap-6">
                          
                          {/* Upload State */}
                          {!file && (
                            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl bg-white/[0.01] hover:bg-white/[0.02] hover:border-white/20 transition-all text-center p-8 group">
                              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 group-hover:bg-white/10 transition-colors">
                                <UploadCloudIcon />
                              </div>
                              <h3 className="text-lg font-semibold text-white mb-2">Upload Audio Target</h3>
                              <p className="text-zinc-500 text-sm mb-6 max-w-sm">
                                Drag and drop an audio file to index and explore its semantic structure in the vector space.
                              </p>
                              <label className="cursor-pointer bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-colors shadow-lg">
                                Select File
                                <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
                              </label>
                            </div>
                          )}
                          
                          {/* Active Audio State */}
                          {file && (
                            <div className="flex flex-col h-full">
                              <div className="flex justify-between items-center mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center border border-indigo-500/30">
                                    <WaveformIcon />
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold text-white">{file.name}</div>
                                    <div className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                  </div>
                                </div>
                                {uploadStatus ? (
                                  <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 text-white">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                    {uploadStatus.charAt(0).toUpperCase() + uploadStatus.slice(1)}
                                  </div>
                                ) : (
                                  <button onClick={handleUpload} className="text-xs font-semibold px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                                    Index Audio
                                  </button>
                                )}
                              </div>

                              <audio
                                ref={audioRef}
                                src={audioUrl!}
                                controls
                                className="hidden"
                                onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                              />
                              
                              <div className="flex-1 relative rounded-xl border border-white/10 bg-black overflow-hidden group mb-4">
                                {/* Sleek Waveform Representation */}
                                <div className="absolute inset-0 flex items-center px-2 gap-0.5 opacity-30">
                                  {[...Array(100)].map((_, i) => (
                                    <div 
                                      key={i} 
                                      className="flex-1 bg-white rounded-full transition-all duration-300" 
                                      style={{ height: `${Math.max(10, Math.abs(Math.sin(i * 0.2)) * 100)}%` }}
                                    ></div>
                                  ))}
                                </div>
                                
                                {/* Hit Overlays */}
                                {duration > 0 && results.map((res, i) => (
                                  <div 
                                    key={i}
                                    style={{
                                      position: "absolute",
                                      left: `${(res.start_time / duration) * 100}%`,
                                      width: `${Math.max(((res.end_time - res.start_time) / duration) * 100, 1)}%`,
                                      height: "100%",
                                      backgroundColor: "rgba(99, 102, 241, 0.2)",
                                      borderLeft: "2px solid rgba(99, 102, 241, 0.8)",
                                      borderRight: "2px solid rgba(99, 102, 241, 0.8)",
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
                                  <button onClick={() => {
                                      if(audioRef.current?.paused) audioRef.current?.play();
                                      else audioRef.current?.pause();
                                    }} 
                                    className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-colors shadow-lg"
                                  >
                                    {_isPlaying ? "❚❚" : "▶"}
                                  </button>
                                  <span>{formatTime(duration)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                     </Panel>
                  </div>
                  
                  {/* BOTTOM ROW: RETRIEVAL RESULTS */}
                  <div className="flex-1 min-h-0">
                     <Panel title="Retrieval Results" badge={results.length > 0 ? `${results.length} Matches` : undefined} className="h-full">
                        <div className="h-full overflow-y-auto pr-4 custom-scrollbar flex flex-col gap-3">
                           {results.length === 0 && hasSearched && (
                             <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                               <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4">
                                 <SearchIcon />
                               </div>
                               <p className="text-sm">No exact semantic matches found.</p>
                             </div>
                           )}
                           
                           {results.length === 0 && !hasSearched && (
                             <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                               <p className="text-sm">Run a query to see contextual results here.</p>
                             </div>
                           )}

                           {results.map((res, idx) => (
                             <div 
                               key={idx} 
                               className="bg-white/[0.03] border border-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/[0.06] hover:border-white/20 transition-all group shadow-sm" 
                               onClick={() => handleTimelineClick(res.start_time)}
                             >
                                <div className="flex justify-between items-center mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
                                      {idx + 1}
                                    </div>
                                    <span className="text-sm font-semibold text-white">Segment Match</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-500 font-medium">Confidence</span>
                                    <span className="text-sm font-bold text-emerald-400">{(res.score * 100).toFixed(1)}%</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 bg-black/40 rounded-lg p-3 border border-white/5">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Resolution</span>
                                    <span className="text-xs text-zinc-300 capitalize">{res.resolution_type}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Timestamp</span>
                                    <span className="text-xs text-zinc-300 font-mono">{formatTime(res.start_time)} - {formatTime(res.end_time)}</span>
                                  </div>
                                </div>
                             </div>
                           ))}
                        </div>
                     </Panel>
                  </div>
               </div>
            )}

               {activeTab === "index" && (
                 <div className="h-full w-full max-w-[1600px] mx-auto flex flex-col gap-6">
                    <div className="flex justify-between items-center bg-white/[0.02] border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
                       <div>
                         <h2 className="text-xl font-bold text-white mb-1">Corpus-Level Clustering Map</h2>
                         <p className="text-sm text-zinc-400">Interactive 3D projection of {corpusData.length} indexed chunks via PCA and K-Means.</p>
                       </div>
                       <div className="flex gap-4 text-xs font-mono">
                         <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Normal Clusters</div>
                         <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"></span> Outliers (Anomalies)</div>
                       </div>
                    </div>
                    
                    <div className="flex-1 bg-white/[0.01] border border-white/5 rounded-2xl overflow-hidden relative shadow-inner">
                       {isLoadingCorpus && (
                         <div className="absolute inset-0 flex items-center justify-center z-20">
                            <span className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
                         </div>
                       )}
                       {!isLoadingCorpus && corpusData.length === 0 && (
                         <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                            No audio indexed yet. Upload a corpus to generate the 3D map.
                         </div>
                       )}
                       {!isLoadingCorpus && corpusData.length > 0 && (
                         <Plot
                           data={getCorpusTraces()}
                           layout={{
                             paper_bgcolor: 'rgba(0,0,0,0)',
                             plot_bgcolor: 'rgba(0,0,0,0)',
                             margin: { l: 0, r: 0, t: 0, b: 0 },
                             scene: {
                               xaxis: { visible: false },
                               yaxis: { visible: false },
                               zaxis: { visible: false },
                               camera: { eye: { x: 1.5, y: 1.5, z: 1.5 } }
                             },
                             legend: { font: { color: '#a1a1aa' }, x: 0, y: 1 },
                             autosize: true
                           }}
                           useResizeHandler={true}
                           style={{ width: "100%", height: "100%" }}
                           config={{ displayModeBar: false }}
                         />
                       )}
                    </div>
                 </div>
               )}

               {activeTab === "strategy" && (
                 <div className="h-full max-w-[1600px] mx-auto flex items-center justify-center">
                    <div className="text-center flex flex-col items-center border border-white/10 bg-white/[0.02] rounded-2xl p-16 shadow-2xl backdrop-blur-xl">
                      <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                        <WaveformIcon />
                      </div>
                      <h2 className="text-3xl font-bold text-white mb-4">Semantic Generation & Smart Clips</h2>
                      <p className="text-zinc-400 max-w-lg mb-8 leading-relaxed">
                        Tweak vectors using text prompts to edit audio directly, or let the engine automatically extract highlight reels from multi-hour podcasts based on semantic density.
                      </p>
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Coming Soon
                      </div>
                    </div>
                 </div>
               )}
            </main>
          </div>
        </div>
      </Show>
      
      {/* Logged out state */}
      <Show when="signed-out">
        <div className="h-screen bg-[#050505] flex items-center justify-center font-sans">
           <SignInButton mode="modal">
              <button className="bg-white text-black px-6 py-3 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                Log in to access dashboard
              </button>
           </SignInButton>
        </div>
      </Show>
    </>
  );
}
