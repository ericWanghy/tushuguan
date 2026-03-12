import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Link as LinkIcon, Clock, User, Download, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { SharedDocument } from '../types';

export default function SharedView() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<SharedDocument | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await fetch(`/api/shared/${token}`);
        if (!res.ok) throw new Error('Document not found or link expired');
        const data = await res.json();
        setDoc(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [token]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-zinc-500">Loading document...</div>;
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-zinc-200/50 w-full max-w-md text-center border border-zinc-100 animate-scale-in">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText size={24} />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-2">Document Unavailable</h1>
          <p className="text-sm text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }

  const handleDownload = () => {
    const blob = new Blob([doc.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans text-zinc-900 selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-zinc-200/60 flex items-center justify-between px-6 shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <BookOpen size={16} strokeWidth={2.5} />
          </div>
          <h1 className="font-semibold text-zinc-900 tracking-tight">Cloud Library <span className="text-zinc-400 font-normal ml-2">Shared Document</span></h1>
        </div>
        <div className="flex items-center gap-3">
          {doc.original_link && (
            <a
              href={doc.original_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
            >
              <LinkIcon size={14} />
              Open Original
            </a>
          )}
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
          >
            <Download size={14} />
            Download
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-12 animate-fade-in">
        <div className="max-w-[760px] mx-auto bg-white p-8 lg:p-16 rounded-3xl shadow-xl shadow-zinc-200/40 border border-zinc-100">
          <div className="mb-10">
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-6">{doc.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-zinc-500">
              <span className="flex items-center gap-1.5 bg-zinc-100/80 px-3 py-1.5 rounded-lg text-zinc-700">
                <User size={14} /> Shared by {doc.author}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={14} /> {format(new Date(doc.created_at), 'MMM d, yyyy')}
              </span>
              {doc.source_type === 'md' ? (
                <span className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                  <FileText size={14} /> Markdown
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                  <LinkIcon size={14} /> Feishu
                </span>
              )}
            </div>
          </div>
          
          <div className="prose prose-zinc prose-lg max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-indigo-600 hover:prose-a:text-indigo-500 prose-img:rounded-2xl prose-img:shadow-md prose-pre:bg-zinc-900 prose-pre:shadow-lg prose-pre:rounded-xl">
            <ReactMarkdown>{doc.content.replace(new RegExp(`^# ${doc.title}\\n+`), '')}</ReactMarkdown>
          </div>
        </div>
      </main>
    </div>
  );
}
