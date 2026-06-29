"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
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
                  {[...Array(64)].map((_, i) => (
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
                 {[...Array(40)].map((_, i) => (
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

      {/* ─── Footer ─── */}
      <footer className="pt-20 pb-10 px-6 reveal-on-scroll">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-16 mb-20">
            <div className="max-w-xs">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-6 h-6 bg-white flex items-center justify-center text-black font-bold text-[10px] rounded-full">
                  EF
                </div>
                <span className="font-semibold text-white tracking-tight">EchoFind</span>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed mb-6">
                Building structural neural search experiences for the world’s most demanding audio datasets.
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-12 text-sm">
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-medium mb-2">Product</h4>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Features</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Integrations</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Pricing</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Changelog</Link>
              </div>
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-medium mb-2">Resources</h4>
                <Link href="/docs" className="text-zinc-500 hover:text-zinc-300 transition-colors">Documentation</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">API Reference</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Blog</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Community</Link>
              </div>
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-medium mb-2">Company</h4>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">About</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Customers</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Careers</Link>
                <Link href="#" className="text-zinc-500 hover:text-zinc-300 transition-colors">Contact</Link>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center text-sm text-zinc-500 border-t border-white/10 pt-8">
            <div className="mb-4 md:mb-0">
              © {new Date().getFullYear()} EchoFind Inc. All rights reserved.
            </div>
            <div className="flex gap-6">
              <Link href="#" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
              <Link href="#" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
