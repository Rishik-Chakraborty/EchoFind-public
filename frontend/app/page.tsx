"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import AsciiArt from "./components/AsciiArt";

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    if (typeof CSS !== 'undefined' && !CSS.supports('(animation-timeline: view()) and (animation-range: entry)')) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const target = entry.target as HTMLElement;
              target.style.opacity = '1';
              target.style.transform = 'translateY(0)';
              observer.unobserve(target);
            }
          }
        },
        { threshold: 0.1 }
      );

      document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.opacity = '0';
        htmlEl.style.transform = 'translateY(40px)';
        htmlEl.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
        observer.observe(el);
      });
    }

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative text-zinc-300 font-sans selection:bg-white selection:text-black">
      <div className="liquid-bg"></div>
      {/* ─── Header Navigation ─── */}
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrollY > 20 ? "bg-[#050505]/80 backdrop-blur-xl border-b border-white/5" : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-white flex items-center justify-center text-black font-bold text-xs rounded-full">
              EF
            </div>
            <span className="font-semibold text-white tracking-tight">EchoFind</span>
          </div>

          <div className="flex items-center gap-6">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                  Log in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="bg-white text-black px-5 py-2 text-sm font-semibold rounded-full hover:bg-zinc-200 transition-colors">
                  Get Started
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors mr-4">
                Dashboard
              </Link>
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        {/* ─── Hero Section ─── */}
        <section className="relative min-h-screen flex flex-col justify-center px-6 pt-32 pb-20 overflow-hidden reveal-on-scroll">
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-white opacity-[0.03] blur-[120px] rounded-full pointer-events-none"></div>
          
          <div className="z-10 max-w-[1200px] w-full mx-auto flex flex-col items-center text-center">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-zinc-300 mb-8 backdrop-blur-md">
               <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
               EchoFind Engine v2 is now live
             </div>
             
             <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-white mb-6 max-w-4xl leading-[1.05]">
               Search audio <br/>
               <span className="text-zinc-500">like never before.</span>
             </h1>
             
             <p className="text-lg md:text-xl text-zinc-400 mb-10 max-w-2xl leading-relaxed">
               We map structural sound distributions to high-dimensional vector space, allowing you to search millions of audio events instantly. No transcripts required.
             </p>
             
             <div className="flex flex-col sm:flex-row gap-4 items-center">
                <Link href="/dashboard" className="bg-white text-black px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-colors w-full sm:w-auto">
                  Start searching
                </Link>
                <Link href="/docs" className="px-8 py-3.5 rounded-full text-sm font-medium text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors w-full sm:w-auto">
                  Read the docs
                </Link>
             </div>
          </div>
          
          {/* Abstract Hero Graphic */}
          <div className="mt-20 max-w-[1000px] w-full mx-auto border border-white/10 rounded-2xl bg-black overflow-hidden relative shadow-2xl">
             <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent"></div>
             <div className="h-12 border-b border-white/10 flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
             </div>
             <style dangerouslySetInnerHTML={{__html: `
               @keyframes hero-waveform {
                 0%, 100% { transform: scaleY(1); }
                 50% { transform: scaleY(0.4); }
               }
             `}} />
             <div className="h-[400px] flex items-center justify-center relative overflow-hidden">
                <div className="absolute w-[600px] h-[600px] bg-indigo-500/10 blur-[80px] rounded-full"></div>
                <div className="flex items-center gap-1 opacity-80 mix-blend-screen">
                  {mounted && [...Array(64)].map((_, i) => (
                    <div 
                      key={i} 
                      className="w-1.5 bg-white/60 rounded-full origin-center" 
                      style={{ 
                        height: `${Math.max(10, Math.sin(i * 0.3) * 60 + Math.cos(i * 0.8) * 40 + 60).toFixed(2)}px`,
                        opacity: Number((0.2 + (Math.sin(i * 0.1) + 1) * 0.4).toFixed(3)),
                        animation: `hero-waveform ${1.5 + Math.abs(Math.sin(i)) * 0.5}s infinite ease-in-out ${Math.abs(Math.cos(i)) * 2}s`
                      }}
                    ></div>
                  ))}
                </div>
             </div>
          </div>
        </section>

        {/* ─── Capabilities ─── */}
        <section className="py-32 px-6">
          <div className="max-w-[1200px] mx-auto">
            <div className="mb-16 reveal-on-scroll text-center max-w-2xl mx-auto">
               <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
                 Everything you need to index sound.
               </h2>
               <p className="text-zinc-400 text-lg">
                 Our proprietary neural pipeline handles everything from ingestion to real-time vector retrieval.
               </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border border-white/10 bg-white/[0.02] p-8 rounded-2xl reveal-on-scroll hover:bg-white/[0.04] transition-colors" style={{ animationDelay: "0ms" }}>
                 <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                 </div>
                 <h3 className="text-xl font-semibold text-white mb-3">Semantic Discovery</h3>
                 <p className="text-zinc-400 leading-relaxed">
                   Search across millions of sound events using natural language. We extract contextual meaning from unstructured audio.
                 </p>
              </div>
              
              <div className="border border-white/10 bg-white/[0.02] p-8 rounded-2xl reveal-on-scroll hover:bg-white/[0.04] transition-colors" style={{ animationDelay: "100ms" }}>
                 <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                 </div>
                 <h3 className="text-xl font-semibold text-white mb-3">Zero-shot Classification</h3>
                 <p className="text-zinc-400 leading-relaxed">
                   Identify recurring motifs and classify audio elements across your entire library without any prior model training.
                 </p>
              </div>
              
              <div className="border border-white/10 bg-white/[0.02] p-8 rounded-2xl reveal-on-scroll hover:bg-white/[0.04] transition-colors" style={{ animationDelay: "200ms" }}>
                 <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                 </div>
                 <h3 className="text-xl font-semibold text-white mb-3">Low-latency API</h3>
                 <p className="text-zinc-400 leading-relaxed">
                   Integrate sound search seamlessly into your product. Our HNSW-indexed vector database provides millisecond retrieval times.
                 </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Search Section ─── */}
        <section className="py-32 px-6 border-y border-white/5">
          <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row gap-16 items-center">
            <div className="lg:w-1/2 reveal-on-scroll">
               <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-[1.1] text-white mb-6">
                 Search the way you hear.
               </h2>
               <p className="text-lg text-zinc-400 mb-8 leading-relaxed">
                 Standard speech-to-text models discard the acoustic landscape. We index the raw waveform natively, capturing pitch, timbre, and emotional shifts so you can find exactly what you&apos;re looking for.
               </p>
               <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-zinc-300 transition-colors group">
                 Explore the dashboard 
                 <span className="group-hover:translate-x-1 transition-transform">→</span>
               </Link>
            </div>
            
            <div className="lg:w-1/2 w-full aspect-square max-h-[500px] border border-white/10 rounded-2xl bg-black relative overflow-hidden flex items-center justify-center reveal-on-scroll shadow-2xl">
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_70%)]"></div>
               {/* Elegant Scatter Plot Mockup */}
               <div className="relative w-full h-full p-8">
                 {mounted && [...Array(40)].map((_, i) => (
                   <div 
                     key={i}
                     className="absolute rounded-full bg-white transition-opacity"
                     style={{
                       left: `${(20 + Math.abs(Math.sin(i * 1.2)) * 60).toFixed(2)}%`,
                       top: `${(20 + Math.abs(Math.cos(i * 0.8)) * 60).toFixed(2)}%`,
                       width: `${(Math.abs(Math.sin(i * 3)) * 6 + 2).toFixed(2)}px`,
                       height: `${(Math.abs(Math.sin(i * 3)) * 6 + 2).toFixed(2)}px`,
                       opacity: Number((Math.abs(Math.cos(i * 2)) * 0.8 + 0.2).toFixed(3)),
                       boxShadow: '0 0 10px rgba(255,255,255,0.5)'
                     }}
                   />
                 ))}
                 {/* Connection lines for structural aesthetic */}
                 <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none">
                   <line x1="30%" y1="40%" x2="50%" y2="60%" stroke="white" strokeWidth="1" />
                   <line x1="50%" y1="60%" x2="70%" y2="30%" stroke="white" strokeWidth="1" />
                   <line x1="70%" y1="30%" x2="60%" y2="80%" stroke="white" strokeWidth="1" />
                 </svg>
               </div>
            </div>
          </div>
        </section>

      </main>

      {/* ─── ASCII Art Hero ─── */}
      <section className="w-full border-t border-white/5 reveal-on-scroll">
        <AsciiArt text="EchoFind" gap={12} />
      </section>

      {/* ─── Footer ─── */}
      <footer className="w-full bg-black py-12 md:py-16 border-t border-white/5 reveal-on-scroll">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col lg:flex-row justify-between gap-12 lg:gap-20">
            {/* Left Column - Brand & Socials */}
            <div className="flex flex-col justify-between lg:w-[300px] shrink-0">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="text-white font-bold text-lg tracking-tight flex items-center gap-1.5">
                    <span className="text-zinc-500 font-normal">[</span>
                    <span className="text-white text-[10px] translate-y-[-1px]">.</span>
                    <span className="text-zinc-500 font-normal">]</span>
                    <span>EchoFind</span>
                  </div>
                  <p className="text-sm text-zinc-500">
                    Search audio like never before
                  </p>
                </div>
                {/* Social Icons row */}
                <div className="flex items-center gap-4 mt-2">
                  <a href="#" className="text-zinc-500 hover:text-white transition-colors" aria-label="Discord">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z"></path></svg>
                  </a>
                  <a href="#" className="text-zinc-500 hover:text-white transition-colors" aria-label="X">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
                  </a>
                  <a href="#" className="text-zinc-500 hover:text-white transition-colors" aria-label="LinkedIn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"></path></svg>
                  </a>
                  <a href="#" className="text-zinc-500 hover:text-white transition-colors" aria-label="GitHub">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"></path></svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Right Column - Links Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-10 w-full text-sm">
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-medium mb-1 text-[13px]">Product</h4>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Neural Search</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Audio Indexing</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">API Gateway</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Pricing</Link>
              </div>
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-medium mb-1 text-[13px]">Integrations</h4>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Python SDK</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Node.js SDK</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">REST API</Link>
              </div>
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-medium mb-1 text-[13px]">Use Cases</h4>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Podcasts</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Music Libraries</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Call Centers</Link>
              </div>
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-medium mb-1 text-[13px]">Security</h4>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Trust Center</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">SOC II</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Privacy Policy</Link>
              </div>
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-medium mb-1 text-[13px]">Resources</h4>
                <Link href="/docs" className="text-zinc-500 hover:text-white transition-colors">Documentation</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Blog</Link>
                <Link href="#" className="text-zinc-500 hover:text-white transition-colors">Changelog</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
