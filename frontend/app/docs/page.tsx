import fs from 'fs';
import path from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

export default function DocsPage() {
  const filePath = path.join(process.cwd(), 'content', 'architecture.md');
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract headings for Table of Contents
  const headings = Array.from(content.matchAll(/^(##|###)\s+(.*)$/gm)).map(match => {
    const text = match[2];
    const id = text.toLowerCase().replace(/[^\w]+/g, '-');
    return { level: match[1].length, text, id };
  });

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-white selection:text-black">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 bg-white flex items-center justify-center text-black font-bold text-xs rounded-full">EF</div>
            <span className="font-semibold text-white tracking-tight">EchoFind Docs</span>
          </Link>
        </div>
      </header>

      {/* Docs Layout */}
      <div className="max-w-[1400px] mx-auto px-6 pt-32 pb-32 flex flex-col lg:flex-row gap-16 relative items-start">
        
        {/* Main Content */}
        <main className="flex-1 min-w-0 max-w-[900px]">
          <article className="text-zinc-300 leading-relaxed">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({node, ...props}) => <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-white tracking-tight" {...props} />,
                h2: ({node, children, ...props}) => {
                  const id = String(children).toLowerCase().replace(/[^\w]+/g, '-');
                  return <h2 id={id} className="text-2xl md:text-3xl font-bold mt-16 mb-6 text-white border-b border-white/10 pb-4 scroll-mt-24" {...props}>{children}</h2>;
                },
                h3: ({node, children, ...props}) => {
                  const id = String(children).toLowerCase().replace(/[^\w]+/g, '-');
                  return <h3 id={id} className="text-xl md:text-2xl font-semibold mt-10 mb-4 text-zinc-100 scroll-mt-24" {...props}>{children}</h3>;
                },
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
                img: ({node, ...props}) => (
                  <div className="my-10 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="rounded-2xl border border-white/10 shadow-2xl max-w-full" {...props} alt={props.alt || ''} />
                  </div>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </main>

        {/* Table of Contents Sidebar */}
        <aside className="hidden lg:block w-[300px] shrink-0 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
          <div className="border-l border-white/10 pl-6 py-2">
            <h4 className="text-white font-semibold mb-4 tracking-tight">On this page</h4>
            <nav className="flex flex-col gap-3">
              {headings.map((heading, i) => (
                <a 
                  key={i} 
                  href={`#${heading.id}`}
                  className={`text-sm transition-colors block ${
                    heading.level === 2 
                      ? 'text-zinc-300 hover:text-white font-medium mt-2' 
                      : 'text-zinc-500 hover:text-zinc-300 ml-4'
                  }`}
                >
                  {heading.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>
        
      </div>
    </div>
  );
}
