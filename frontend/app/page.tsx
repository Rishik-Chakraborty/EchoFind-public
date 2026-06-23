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

    // Intersection Observer Fallback for native CSS scroll-driven animations
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
    <div className="min-h-screen flex flex-col bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* ─── Header Navigation ─── */}
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrollY > 50 ? "bg-white/90 backdrop-blur-md border-b border-gray-200" : "bg-transparent"
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-black flex items-center justify-center text-white font-bold text-lg">
              EF
            </div>
            <span className="font-bold text-2xl tracking-tighter">EchoFind.</span>
          </div>

          <div className="flex items-center gap-6">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-sm font-semibold hover:opacity-70 transition-opacity">Log In</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="bg-black text-white px-6 py-2.5 text-sm font-semibold hover:bg-gray-800 transition-colors">
                  Sign Up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className="text-sm font-semibold hover:opacity-70 transition-opacity mr-4">
                Dashboard
              </Link>
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        {/* ─── Hero Section ─── */}
        <section className="relative h-screen flex flex-col items-center justify-center bg-zinc-100 px-6 pt-20 overflow-hidden reveal-on-scroll">
          <div className="absolute inset-0 z-0 opacity-20 pointer-events-none flex flex-col justify-between">
             {/* Abstract Greyscale Pattern representing sound */}
             <div className="w-full h-1/4 bg-gradient-to-b from-gray-300 to-transparent"></div>
             <div className="w-full h-1/4 bg-gradient-to-t from-gray-300 to-transparent"></div>
          </div>
          
          <div className="z-10 text-center max-w-[1200px]">
            <h1 className="text-[clamp(4rem,10vw,8rem)] font-black tracking-tighter leading-[0.9] text-black mb-8">
              EchoFind.<br/>Sound As You Are.
            </h1>
            <p className="text-[clamp(1.2rem,2vw,1.5rem)] font-medium text-gray-600 max-w-2xl mx-auto mb-12 tracking-tight">
              We create structural neural search experiences for the world’s most demanding audio datasets. Find exactly what you hear, instantly.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
               <Link href="/dashboard" className="bg-black text-white px-10 py-5 text-lg font-bold hover:bg-gray-800 transition-colors w-full sm:w-auto">
                 Explore the Platform
               </Link>
            </div>
          </div>
        </section>

        {/* ─── Our Services ─── */}
        <section className="py-32 px-6 bg-black text-white">
          <div className="max-w-[1400px] mx-auto">
            <h2 className="text-[clamp(3rem,6vw,5rem)] font-bold tracking-tighter leading-tight mb-20 border-b border-zinc-800 pb-10 reveal-on-scroll">
              Our Services.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 border-b border-zinc-800 pb-20">
              <div className="flex flex-col gap-6 group cursor-pointer reveal-on-scroll" style={{ animationDelay: "0ms" }}>
                <div className="h-64 bg-zinc-900 overflow-hidden relative">
                   <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                <h3 className="text-3xl font-bold tracking-tight">Neural Audio Strategy</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Map your sonic architecture. We analyze millions of sound events to extract semantic meaning, allowing you to build a comprehensive audio strategy.
                </p>
              </div>
              <div className="flex flex-col gap-6 group cursor-pointer reveal-on-scroll" style={{ animationDelay: "100ms" }}>
                <div className="h-64 bg-zinc-800 overflow-hidden relative">
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                <h3 className="text-3xl font-bold tracking-tight">Sonic Identity</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Develop a cohesive audio footprint. Find recurring motifs and classify audio elements across your entire library using zero-shot classification.
                </p>
              </div>
              <div className="flex flex-col gap-6 group cursor-pointer reveal-on-scroll" style={{ animationDelay: "200ms" }}>
                <div className="h-64 bg-zinc-900 overflow-hidden relative">
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                <h3 className="text-3xl font-bold tracking-tight">Experience Design</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Integrate sound seamlessly. Our APIs and pipelines provide low-latency retrieval for production-ready applications.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Audio Search That Makes a Difference ─── */}
        <section className="py-40 px-6 bg-white text-black">
          <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-20 items-center">
            <div className="lg:w-1/2 reveal-on-scroll">
               <h2 className="text-[clamp(3rem,6vw,5rem)] font-bold tracking-tighter leading-[1.1] mb-10">
                 Audio Search That Makes a Difference.
               </h2>
               <p className="text-2xl text-gray-500 font-medium mb-10 leading-snug">
                 We build structural models that understand sound inherently, boosting retrieval speeds and surfacing emotional connections through innovative technology.
               </p>
               <Link href="/dashboard" className="inline-flex items-center gap-4 text-xl font-bold border-b-2 border-black pb-1 hover:text-gray-600 hover:border-gray-600 transition-colors">
                 See the platform in action
                 <span className="text-2xl">→</span>
               </Link>
            </div>
            <div className="lg:w-1/2 w-full aspect-square bg-zinc-200 relative overflow-hidden flex items-center justify-center reveal-on-scroll">
               <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjZWVlIiBzdHJva2Utd2lkdGg9IjEiPjwvcGF0aD4KPC9zdmc+')] opacity-50"></div>
               {/* Abstract geometric representation of sound waves */}
               <div className="w-3/4 h-3/4 border-8 border-black rounded-full flex items-center justify-center relative z-10">
                 <div className="w-1/2 h-1/2 bg-black rounded-full"></div>
               </div>
            </div>
          </div>
        </section>

        {/* ─── Neural DNA ─── */}
        <section className="py-32 px-6 bg-zinc-100 text-black">
          <div className="max-w-[1400px] mx-auto text-center reveal-on-scroll">
            <h2 className="text-[clamp(3rem,6vw,5rem)] font-black tracking-tighter leading-tight mb-12">
              Neural DNA.
            </h2>
            <p className="text-2xl text-gray-600 font-medium max-w-4xl mx-auto mb-20 leading-relaxed">
              Every dataset has a unique auditory signature. Our proprietary extraction pipeline isolates, categorizes, and indexes your entire library, bringing order to chaos.
            </p>
            <div className="w-full h-64 bg-black flex items-end justify-center gap-2 p-10 overflow-hidden">
              {/* Static visualizer representation */}
              {[...Array(40)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-4 bg-white" 
                  style={{ height: `${(20 + (Math.sin(i * 0.5) + 1) * 40).toFixed(2)}%`, opacity: 0.8 }}
                ></div>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* ─── Footer ─── */}
      <footer className="bg-black text-white pt-32 pb-10 px-6 reveal-on-scroll">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-20 mb-32 border-b border-zinc-800 pb-20">
            <div className="max-w-md">
              <h2 className="text-4xl font-bold tracking-tighter mb-8">Ready to hear the difference?</h2>
              <Show when="signed-out">
                <SignUpButton mode="modal">
                  <button className="bg-white text-black px-8 py-4 text-lg font-bold hover:bg-gray-200 transition-colors">
                    Start Searching Now
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <Link href="/dashboard" className="inline-block bg-white text-black px-8 py-4 text-lg font-bold hover:bg-gray-200 transition-colors">
                  Go to Dashboard
                </Link>
              </Show>
            </div>
            <div className="grid grid-cols-2 gap-16">
              <div className="flex flex-col gap-4">
                <h4 className="text-zinc-500 font-bold mb-4 uppercase tracking-widest text-sm">Navigation</h4>
                <Link href="#" className="text-xl font-semibold hover:text-zinc-400 transition-colors">Services</Link>
                <Link href="#" className="text-xl font-semibold hover:text-zinc-400 transition-colors">Work</Link>
                <Link href="#" className="text-xl font-semibold hover:text-zinc-400 transition-colors">Platform</Link>
              </div>
              <div className="flex flex-col gap-4">
                <h4 className="text-zinc-500 font-bold mb-4 uppercase tracking-widest text-sm">Follow Us</h4>
                <a href="#" className="text-xl font-semibold hover:text-zinc-400 transition-colors">LinkedIn</a>
                <a href="#" className="text-xl font-semibold hover:text-zinc-400 transition-colors">YouTube</a>
                <a href="#" className="text-xl font-semibold hover:text-zinc-400 transition-colors">Instagram</a>
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center text-zinc-500 font-medium">
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-white flex items-center justify-center text-black font-bold text-xs">EF</div>
              <span>© 2026 EchoFind. All rights reserved.</span>
            </div>
            <div className="flex gap-8">
              <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link href="#" className="hover:text-white transition-colors">Imprint</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
