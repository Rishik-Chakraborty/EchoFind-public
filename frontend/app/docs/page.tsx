import fs from 'fs';
import path from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

export default function DocsPage() {
  const filePath = path.join(process.cwd(), 'content', 'architecture.md');
  const content = fs.readFileSync(filePath, 'utf8');

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-white selection:text-black">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 bg-white flex items-center justify-center text-black font-bold text-xs rounded-full">EF</div>
            <span className="font-semibold text-white tracking-tight">EchoFind Docs</span>
          </Link>
        </div>
      </header>

      {/* Docs Content */}
      <main className="max-w-4xl mx-auto px-6 pt-32 pb-20">
        <article className="prose prose-invert prose-zinc max-w-none 
          prose-headings:tracking-tight prose-a:text-indigo-400 hover:prose-a:text-indigo-300
          prose-code:text-emerald-300 prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10
          prose-img:rounded-xl prose-img:border prose-img:border-white/10
          prose-hr:border-white/10">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
