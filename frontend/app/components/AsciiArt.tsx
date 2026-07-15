"use client";

import React, { useEffect, useRef, useState } from "react";

interface AsciiArtProps {
  text: string;
  gap?: number; // spacing between elements
}

export default function AsciiArt({ text, gap = 14 }: AsciiArtProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<{ x: number; y: number; active: boolean; char: string }[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, cols: 0, rows: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const { clientWidth, clientHeight } = container;
    
    // We want to create a grid of `[ ]`
    const cols = Math.floor(clientWidth / gap);
    const rows = Math.floor(clientHeight / gap);
    
    setDimensions({ width: clientWidth, height: clientHeight, cols, rows });

    // 1. Draw text on a hidden canvas to get pixel data
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    
    if (!ctx) return;
    
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, cols, rows);
    
    ctx.fillStyle = "white";
    // Adjust font size based on rows and columns to fit perfectly
    const fontSize = Math.min(rows * 0.8, cols / (text.length * 0.6));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Slightly offset Y to center better
    ctx.fillText(text, cols / 2, rows / 2 + fontSize * 0.1);
    
    const imageData = ctx.getImageData(0, 0, cols, rows).data;
    
    const newGrid = [];
    const bgChars = ["[ ]", "[.]", "[,]"];
    const activeChars = ["[ ]", "[|]", "[:]"];
    
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const index = (y * cols + x) * 4;
        // Check if the pixel is white-ish (from our text)
        const active = imageData[index] > 128;
        
        const chars = active ? activeChars : bgChars;
        const char = chars[Math.floor(Math.random() * chars.length)];
        
        newGrid.push({ x, y, active, char });
      }
    }
    
    setGrid(newGrid);
    
    // Optional: add a resize listener
    const handleResize = () => {
      // Small delay to prevent thrashing
      setTimeout(() => {
        setGrid([]); // Trigger re-render
      }, 100);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [text, gap, grid.length]); // re-run if grid is cleared by resize

  return (
    <div 
      ref={containerRef} 
      className="relative w-full overflow-hidden font-mono select-none flex items-center justify-center bg-black"
      style={{ height: "350px" }}
    >
      <style>{`
        @keyframes ascii-reveal {
          0% { opacity: 0; transform: scale(0.8) translateY(5px); filter: blur(2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
        }
      `}</style>

      {/* Background gradient overlay to fade edges */}
      <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,#000000_90%)]"></div>
      
      {grid.length > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {Array.from({ length: dimensions.rows }).map((_, y) => (
            <div key={y} className="flex whitespace-nowrap">
              {grid.filter(cell => cell.y === y).map((cell, x) => {
                // Stagger animation: left-to-right sweep + center-out + randomness
                const delay = (x * 12) + (Math.abs(y - dimensions.rows / 2) * 20) + (Math.random() * 400);
                
                return (
                  <span 
                    key={`${x}-${y}`} 
                    className={`inline-block text-center transition-all duration-700`}
                    style={{ 
                      width: gap,
                      height: gap,
                      lineHeight: `${gap}px`,
                      fontSize: `${gap * 0.8}px`,
                      color: cell.active ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.05)",
                      textShadow: cell.active ? "0 0 10px rgba(255,255,255,0.4)" : "none",
                      fontWeight: cell.active ? 600 : 400,
                      letterSpacing: "-1px",
                      opacity: 0,
                      animation: `ascii-reveal 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
                      animationDelay: `${delay}ms`
                    }}
                  >
                    {cell.char}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
