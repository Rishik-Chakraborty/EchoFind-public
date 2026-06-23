"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function LandingPage() {
  const [waveConfig, setWaveConfig] = useState<{ delay: string; duration: string; maxH: number }[]>([]);

  useEffect(() => {
    // Generate stable values for the hero equalizer on mount
    setWaveConfig([...Array(24)].map(() => ({
      delay: -(Math.random() * 2).toFixed(2),
      duration: (0.5 + Math.random() * 0.8).toFixed(2),
      maxH: 20 + Math.random() * 80 // Height between 20% and 100%
    })));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes inline-eq-bounce {
          0% { height: 8px; }
          100% { height: 100%; }
        }
        .local-hero-wave-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 120px;
          margin-bottom: 2rem;
        }
        .local-hero-wave-bar {
          width: 10px;
          background-color: var(--primary, #18181b);
          border-radius: 9999px;
          animation: inline-eq-bounce 1s ease-in-out infinite alternate;
          opacity: 0.8;
        }

        .bg-wave-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: -1;
          overflow: hidden;
          pointer-events: none;
        }

        .bg-wave {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 200vw;
          height: 60vh;
          background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1800 300" xmlns="http://www.w3.org/2000/svg"><path d="M0,150 C300,300 600,0 900,150 C1200,300 1500,0 1800,150 L1800,300 L0,300 Z" fill="rgba(0,0,0,0.06)"/></svg>') repeat-x;
          background-size: 50vw 60vh;
          animation: wave-shift 25s linear infinite;
          transform-origin: bottom;
        }

        .bg-wave:nth-child(2) {
          height: 70vh;
          background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1800 300" xmlns="http://www.w3.org/2000/svg"><path d="M0,100 C300,200 600,0 900,100 C1200,200 1500,0 1800,100 L1800,300 L0,300 Z" fill="rgba(0,0,0,0.04)"/></svg>') repeat-x;
          background-size: 50vw 70vh;
          animation: wave-shift 35s linear infinite reverse;
        }

        .bg-wave:nth-child(3) {
          height: 50vh;
          background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 1800 300" xmlns="http://www.w3.org/2000/svg"><path d="M0,200 C300,100 600,300 900,200 C1200,100 1500,300 1800,200 L1800,300 L0,300 Z" fill="rgba(0,0,0,0.08)"/></svg>') repeat-x;
          background-size: 50vw 50vh;
          animation: wave-shift 20s linear infinite;
        }

        @keyframes wave-shift {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50vw); }
        }

        @media (prefers-reduced-motion: reduce) {
          .bg-wave {
            animation: none !important;
          }
        }
      `}} />

      {/* Background Waves */}
      <div className="bg-wave-container">
        <div className="bg-wave" />
        <div className="bg-wave" />
        <div className="bg-wave" />
      </div>

      {/* ─── Header Navigation ─── */}
      <header
        style={{
          position: "fixed",
          top: 0,
          width: "100%",
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

      {/* ─── Hero Section ─── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", marginTop: 64 }}>
        
        <div className="local-hero-wave-container">
          {waveConfig.map((config, i) => (
            <div 
              key={i} 
              className="local-hero-wave-bar"
              style={{
                animationDelay: `${config.delay}s`,
                animationDuration: `${config.duration}s`,
                height: `${config.maxH}%`
              }}
            />
          ))}
        </div>

        <div style={{ textAlign: "center", maxWidth: 800 }}>
          <h1 style={{ fontSize: "clamp(3rem, 6vw, 4.5rem)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: 16, color: "var(--foreground)" }}>
            Neural Audio Search
          </h1>
          <p style={{ fontSize: "1rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--primary)", marginBottom: 24, opacity: 0.8 }}>
            Command F for Audio
          </p>
          <p style={{ fontSize: "clamp(1.125rem, 2vw, 1.25rem)", color: "var(--muted-foreground)", marginBottom: 40, lineHeight: 1.6, maxWidth: 600, margin: "0 auto 40px" }}>
            Upload complex soundscapes and triage audio events through natural language. Fast, precise, and entirely driven by neural networks.
          </p>
          
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <Link href="/dashboard" className="btn btn-primary" style={{ padding: "0 32px", height: "3rem", fontSize: "1rem", borderRadius: "100px" }}>
              Enter Dashboard
            </Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ padding: "0 32px", height: "3rem", fontSize: "1rem", borderRadius: "100px" }}>
              View Documentation
            </a>
          </div>
        </div>

      </main>

      {/* ─── Footer ─── */}
      <footer style={{ padding: "40px 24px", borderTop: "1px solid var(--border)", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
        © 2026 EchoFind. All rights reserved.
      </footer>
    </div>
  );
}
