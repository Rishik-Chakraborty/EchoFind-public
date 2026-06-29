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
      <main className="max-w-[900px] mx-auto px-6 pt-32 pb-32">
        <article className="text-zinc-300 leading-relaxed">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({node, ...props}) => <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-white tracking-tight" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-2xl md:text-3xl font-bold mt-16 mb-6 text-white border-b border-white/10 pb-4" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-xl md:text-2xl font-semibold mt-10 mb-4 text-zinc-100" {...props} />,
              h4: ({node, ...props}) => <h4 className="text-lg font-semibold mt-8 mb-4 text-zinc-200" {...props} />,
              p: ({node, ...props}) => <p className="mb-6 text-zinc-400 text-lg leading-relaxed" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-8 text-zinc-400 space-y-3 text-lg" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-8 text-zinc-400 space-y-3 text-lg" {...props} />,
              li: ({node, ...props}) => <li className="pl-2" {...props} />,
              a: ({node, ...props}) => <a className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition-colors" {...props} />,
              strong: ({node, ...props}) => <strong className="font-semibold text-zinc-200" {...props} />,
              blockquote: ({node, ...props}) => (
                <blockquote className="border-l-4 border-indigo-500 pl-6 py-2 my-8 italic text-zinc-400 bg-white/5 rounded-r-xl" {...props} />
              ),
              pre: ({node, ...props}) => (
                <div className="mb-8 rounded-xl border border-white/10 bg-[#0a0a0a] overflow-hidden shadow-2xl">
                  <div className="flex items-center px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                      <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                      <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                    </div>
                  </div>
                  <pre className="p-6 overflow-x-auto text-[15px] font-mono text-zinc-300" {...props} />
                </div>
              ),
              code: ({node, className, ...props}) => {
                const isInline = !className?.includes('language-');
                return isInline ? (
                  <code className="bg-white/10 text-emerald-300 px-1.5 py-0.5 rounded-md text-[0.85em] font-mono border border-white/5" {...props} />
                ) : (
                  <code className={className} {...props} />
                );
              },
              table: ({node, ...props}) => (
                <div className="overflow-x-auto mb-8 rounded-xl border border-white/10">
                  <table className="w-full text-left border-collapse text-sm" {...props} />
                </div>
              ),
              th: ({node, ...props}) => <th className="border-b border-white/10 py-4 px-6 text-white font-semibold bg-white/[0.03]" {...props} />,
              td: ({node, ...props}) => <td className="border-b border-white/5 py-4 px-6 text-zinc-400 align-top" {...props} />,
              hr: ({node, ...props}) => <hr className="my-12 border-white/10" {...props} />,
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
