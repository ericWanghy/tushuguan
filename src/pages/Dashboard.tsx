import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, FileText, Link as LinkIcon, Download, Trash2, X, BookOpen, Folder as FolderIcon, Clock, Sparkles, LogOut, Share2, Users, ChevronRight, ChevronDown, FolderPlus, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { Document, User, Folder } from '../types';

const DocCard = ({ doc, onClick, onDelete, onShare, isSelected }: { doc: Document, onClick: () => void, onDelete?: (id: string, e: React.MouseEvent) => void, onShare?: (id: string, e: React.MouseEvent) => void, isSelected?: boolean }) => (
  <div
    onClick={onClick}
    className={`group p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col h-full ${isSelected ? 'border-indigo-500/40 bg-indigo-50/40 shadow-md shadow-indigo-500/5' : 'border-zinc-200/80 bg-white hover:border-zinc-300/80 hover:shadow-xl hover:shadow-zinc-200/40 hover:-translate-y-0.5'}`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-lg ${doc.source_type === 'md' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {doc.source_type === 'md' ? <FileText size={16} /> : <LinkIcon size={16} />}
        </div>
        <h3 className="font-semibold text-zinc-900 line-clamp-1 text-base">{doc.title}</h3>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
        {onShare && (
          <button
            onClick={(e) => onShare(doc.id, e)}
            className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            title="Share"
          >
            <Share2 size={16} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => onDelete(doc.id, e)}
            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
    <p className="text-sm text-zinc-500 line-clamp-2 mb-4 leading-relaxed flex-1">
      {doc.content.substring(0, 150).replace(/#/g, '')}...
    </p>
    <div className="flex items-center justify-between text-xs font-medium text-zinc-400 mt-auto">
      <span className="flex items-center gap-1.5"><Clock size={12} /> {format(new Date(doc.last_opened_at || doc.created_at), 'MMM d, yyyy')}</span>
    </div>
  </div>
);

export default function Dashboard({ user, onLogout }: { user: User, onLogout: () => void }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [homeData, setHomeData] = useState<{ recentAdded: Document[], recentOpened: Document[] }>({ recentAdded: [], recentOpened: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = Home, 'all' = All Docs, 'root' = Root, uuid = specific folder
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'md' | 'feishu'>('md');
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isHome = !searchQuery && selectedFolder === null && !selectedDoc;
  const isAllDocs = selectedFolder === 'all';

  const authHeaders = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

  const fetchData = async () => {
    try {
      const [homeRes, docsRes, foldersRes] = await Promise.all([
        fetch('/api/documents/home', { headers: authHeaders }),
        fetch(`/api/documents?${searchQuery ? `q=${searchQuery}&` : ''}${selectedFolder ? `folder_id=${selectedFolder}` : ''}`, { headers: authHeaders }),
        fetch('/api/folders', { headers: authHeaders })
      ]);

      if (homeRes.ok) setHomeData(await homeRes.json());
      if (docsRes.ok) setDocuments(await docsRes.json());
      if (foldersRes.ok) setFolders(await foldersRes.json());
    } catch (error) {
      console.error('Failed to fetch data', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchQuery, selectedFolder, isHome]);

  const handleSelectDoc = async (doc: Document) => {
    setSelectedDoc(doc);
    try {
      await fetch(`/api/documents/${doc.id}/open`, { method: 'PUT', headers: authHeaders });
      fetchData();
    } catch (error) {
      console.error('Failed to update last opened', error);
    }
  };

  const handleUploadMD = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    
    const targetFolder = (selectedFolder === 'all' || !selectedFolder) ? 'root' : selectedFolder;
    formData.append('folder_id', targetFolder);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (res.ok) {
        setIsUploadModalOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error('Upload failed', error);
    }
  };

  const handleAddFeishu = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const link = formData.get('link') as string;
    const targetFolder = (selectedFolder === 'all' || !selectedFolder) ? 'root' : selectedFolder;
    
    try {
      const res = await fetch('/api/documents/feishu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ link, folder_id: targetFolder }),
      });
      if (res.ok) {
        setIsUploadModalOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error('Add Feishu failed', error);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name: newFolderName, parent_id: null }), // Flat for now, can be extended
      });
      if (res.ok) {
        setNewFolderName('');
        setIsCreateFolderModalOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error('Create folder failed', error);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE', headers: authHeaders });
      if (res.ok) {
        if (selectedDoc?.id === id) setSelectedDoc(null);
        fetchData();
      }
    } catch (error) {
      console.error('Delete failed', error);
    }
  };

  const handleShare = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/documents/${id}/share`, { method: 'POST', headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        const link = `${window.location.origin}/shared/${data.token}`;
        setShareLink(link);
        setCopied(false);
      }
    } catch (error) {
      console.error('Share failed', error);
    }
  };

  const copyToClipboard = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-zinc-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Sidebar */}
      <div className="w-[260px] bg-zinc-950 border-r border-zinc-900 flex flex-col text-zinc-300 shrink-0">
        <div className="h-20 px-6 flex items-center gap-3 cursor-pointer" onClick={() => { setSearchQuery(''); setSelectedFolder(null); setSelectedDoc(null); }}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <BookOpen size={18} strokeWidth={2.5} />
          </div>
          <h1 className="font-semibold text-lg tracking-tight text-white">Cloud Library</h1>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-3">Library</h2>
          <ul className="space-y-1 mb-8">
            <li>
              <button
                onClick={() => { setSelectedFolder(null); setSelectedDoc(null); setSearchQuery(''); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${isHome ? 'bg-zinc-800/80 text-white font-medium shadow-sm' : 'hover:bg-zinc-800/40 hover:text-white'}`}
              >
                <Sparkles size={16} className={isHome ? 'text-indigo-400' : 'text-zinc-500'} />
                Home
              </button>
            </li>
            <li>
              <button
                onClick={() => { setSelectedFolder('all'); setSelectedDoc(null); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${isAllDocs ? 'bg-zinc-800/80 text-white font-medium shadow-sm' : 'hover:bg-zinc-800/40 hover:text-white'}`}
              >
                <FolderIcon size={16} className={isAllDocs ? 'text-indigo-400' : 'text-zinc-500'} />
                All Documents
              </button>
            </li>
          </ul>

          <div className="flex items-center justify-between mb-3 px-3">
            <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">My Folders</h2>
            <button onClick={() => setIsCreateFolderModalOpen(true)} className="text-zinc-500 hover:text-white transition-colors">
              <FolderPlus size={14} />
            </button>
          </div>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => { setSelectedFolder('root'); setSelectedDoc(null); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${selectedFolder === 'root' ? 'bg-zinc-800/80 text-white font-medium shadow-sm' : 'hover:bg-zinc-800/40 hover:text-white'}`}
              >
                <FolderIcon size={16} className={selectedFolder === 'root' ? 'text-indigo-400' : 'text-zinc-500'} />
                Root Directory
              </button>
            </li>
            {folders.map(folder => (
              <li key={folder.id}>
                <button
                  onClick={() => { setSelectedFolder(folder.id); setSelectedDoc(null); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${selectedFolder === folder.id ? 'bg-zinc-800/80 text-white font-medium shadow-sm' : 'hover:bg-zinc-800/40 hover:text-white'}`}
                >
                  <FolderIcon size={16} className={selectedFolder === folder.id ? 'text-indigo-400' : 'text-zinc-500'} />
                  {folder.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        
        {/* User Profile */}
        <div className="p-4 border-t border-zinc-900">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-zinc-800/40 transition-colors cursor-pointer group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-white uppercase">
                {user.username.substring(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.username}</p>
                <p className="text-xs text-zinc-500 truncate capitalize">{user.role} Workspace</p>
              </div>
            </div>
            <button onClick={onLogout} className="text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header (Hidden on Home) */}
        {!isHome && (
          <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-zinc-200/60 flex items-center justify-between px-8 shrink-0 sticky top-0 z-20 animate-fade-in">
            <div className="relative w-[400px] group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
              <input
                type="text"
                placeholder="Search by keyword or semantic meaning..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-zinc-100/80 border border-transparent rounded-full text-sm focus:bg-white focus:border-indigo-500/30 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none placeholder:text-zinc-500"
              />
            </div>
            
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-95"
            >
              <Plus size={16} />
              New Document
            </button>
          </header>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-hidden flex relative">
          
          {/* Home View */}
          {isHome && (
            <div className="flex-1 overflow-y-auto p-8 lg:p-12 bg-[#FAFAFA] flex flex-col items-center animate-fade-in">
              <div className="w-full max-w-3xl mt-12 mb-16 animate-fade-in-up">
                <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-8 text-center">What are you looking for?</h1>
                <div className="relative group shadow-2xl shadow-zinc-200/50 rounded-full">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-500 transition-colors w-6 h-6" />
                  <input
                    type="text"
                    placeholder="Search documents, notes, or Feishu links..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-16 pr-6 py-5 bg-white border border-zinc-200/80 rounded-full text-lg focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-zinc-400"
                  />
                </div>
              </div>

              <div className="w-full max-w-6xl grid grid-cols-1 xl:grid-cols-2 gap-12 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                {/* Recently Opened */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Clock className="text-indigo-500" size={20} />
                      <h2 className="text-xl font-semibold text-zinc-900">Recently Opened</h2>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {homeData.recentOpened.map((doc) => (
                      <DocCard key={doc.id} doc={doc} onClick={() => handleSelectDoc(doc)} onShare={handleShare} />
                    ))}
                    {homeData.recentOpened.length === 0 && (
                      <div className="p-8 text-center border border-dashed border-zinc-200 rounded-2xl text-zinc-500 text-sm">No recently opened documents</div>
                    )}
                  </div>
                </div>

                {/* Recently Added */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Plus className="text-emerald-500" size={20} />
                      <h2 className="text-xl font-semibold text-zinc-900">Recently Added</h2>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {homeData.recentAdded.map((doc) => (
                      <DocCard key={doc.id} doc={doc} onClick={() => handleSelectDoc(doc)} onShare={handleShare} />
                    ))}
                    {homeData.recentAdded.length === 0 && (
                      <div className="p-8 text-center border border-dashed border-zinc-200 rounded-2xl text-zinc-500 text-sm">No recently added documents</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Document List (Hidden on Home) */}
          {!isHome && (
            <div className={`flex-1 overflow-y-auto p-8 ${selectedDoc ? 'hidden lg:block lg:max-w-[420px] border-r border-zinc-200/60 bg-[#FAFAFA]' : 'bg-[#FAFAFA]'}`}>
              <div className="mb-8 flex items-end justify-between animate-fade-in">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  {isAllDocs ? 'All Documents' : (selectedFolder === 'root' ? 'Root Directory' : folders.find(f => f.id === selectedFolder)?.name || 'Search Results')}
                </h2>
                <span className="text-xs font-semibold text-zinc-500 bg-zinc-200/60 px-2.5 py-1 rounded-full">{documents.length} items</span>
              </div>
              
              {documents.length === 0 ? (
                <div className="text-center py-20 animate-fade-in-up">
                  <div className="w-20 h-20 bg-white shadow-sm border border-zinc-100 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
                    <FileText className="text-zinc-300" size={32} />
                  </div>
                  <h3 className="text-zinc-900 font-medium text-lg mb-2">No documents found</h3>
                  <p className="text-zinc-500 text-sm max-w-[240px] mx-auto">Try adjusting your search or upload a new document.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {documents.map((doc, i) => (
                    <div key={doc.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                      <DocCard 
                        doc={doc} 
                        onClick={() => handleSelectDoc(doc)} 
                        onDelete={handleDelete}
                        onShare={handleShare}
                        isSelected={selectedDoc?.id === doc.id}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Document Viewer */}
          {selectedDoc && !isHome && (
            <div className="flex-1 flex flex-col bg-white overflow-hidden relative animate-fade-in">
              {/* Viewer Header */}
              <div className="h-20 border-b border-zinc-100 flex items-center justify-between px-8 shrink-0 bg-white/90 backdrop-blur-xl absolute top-0 left-0 right-0 z-10">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSelectedDoc(null)}
                    className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                  <div className="flex items-center gap-3">
                    {selectedDoc.source_type === 'md' ? (
                      <span className="bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <FileText size={12} /> Markdown
                      </span>
                    ) : (
                      <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <LinkIcon size={12} /> Feishu
                      </span>
                    )}
                    <span className="text-sm font-medium text-zinc-400 flex items-center gap-1.5">
                      <Clock size={14} />
                      {format(new Date(selectedDoc.last_opened_at || selectedDoc.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => handleShare(selectedDoc.id, e)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
                  >
                    <Share2 size={14} />
                    Share
                  </button>
                  {selectedDoc.original_link && (
                    <a
                      href={selectedDoc.original_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                      <LinkIcon size={14} />
                      Open Original
                    </a>
                  )}
                  <a
                    href={`/api/documents/${selectedDoc.id}/download`}
                    download
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                  >
                    <Download size={14} />
                    Download
                  </a>
                </div>
              </div>
              
              {/* Viewer Content */}
              <div className="flex-1 overflow-y-auto p-8 lg:p-16 pt-28 lg:pt-32 scroll-smooth">
                <div className="max-w-[760px] mx-auto">
                  <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-10">{selectedDoc.title}</h1>
                  <div className="prose prose-zinc prose-lg max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-indigo-600 hover:prose-a:text-indigo-500 prose-img:rounded-2xl prose-img:shadow-md prose-pre:bg-zinc-900 prose-pre:shadow-lg prose-pre:rounded-xl">
                    <ReactMarkdown>{selectedDoc.content.replace(new RegExp(`^# ${selectedDoc.title}\\n+`), '')}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h2 className="text-lg font-semibold tracking-tight">Add Document</h2>
              <button onClick={() => setIsUploadModalOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="flex p-1 bg-zinc-100/80 rounded-xl mb-6">
                <button
                  onClick={() => setUploadType('md')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${uploadType === 'md' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Upload Markdown
                </button>
                <button
                  onClick={() => setUploadType('feishu')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${uploadType === 'feishu' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Feishu Link
                </button>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-medium text-zinc-700 mb-2">Target Folder</label>
                <select
                  value={(selectedFolder === 'all' || !selectedFolder) ? 'root' : selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}
                >
                  <option value="root">Root Directory</option>
                  {folders.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {uploadType === 'md' ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Files</label>
                  <div className="mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-zinc-200 border-dashed rounded-2xl hover:border-indigo-500 hover:bg-indigo-50/30 transition-all cursor-pointer relative group">
                    <div className="space-y-2 text-center">
                      <div className="w-12 h-12 bg-zinc-100 group-hover:bg-indigo-100 rounded-full flex items-center justify-center mx-auto transition-colors">
                        <FileText className="h-6 w-6 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                      </div>
                      <div className="flex text-sm text-zinc-600 justify-center">
                        <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                          <span>Click to upload</span>
                          <input id="file-upload" name="file-upload" type="file" accept=".md" multiple className="sr-only" onChange={handleUploadMD} />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-zinc-400">Markdown (.md) files, supports batch upload</p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAddFeishu}>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">Feishu Document Link</label>
                    <input
                      type="url"
                      name="link"
                      required
                      placeholder="https://feishu.cn/docs/..."
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-zinc-900 hover:bg-zinc-800 text-white py-3 rounded-xl text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
                  >
                    Import Document
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {isCreateFolderModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h2 className="text-lg font-semibold tracking-tight">Create Folder</h2>
              <button onClick={() => setIsCreateFolderModalOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-700 mb-2">Folder Name</label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g., Projects 2026"
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white py-3 rounded-xl text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
              >
                Create
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Share Link Modal */}
      {shareLink && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <Share2 size={18} className="text-indigo-500" /> Share Document
              </h2>
              <button onClick={() => setShareLink(null)} className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-zinc-500 mb-4">Anyone with this link can view the document. They do not need an account.</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="flex-1 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-600 focus:outline-none"
                />
                <button
                  onClick={copyToClipboard}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${copied ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
