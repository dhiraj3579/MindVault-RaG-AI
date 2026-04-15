/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { ChatInterface } from './components/ChatInterface';
import { Database, FileText, Layout, Info, Github, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

export default function App() {
  const [chunkCount, setChunkCount] = useState(0);
  const [apiStatus, setApiStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (!data.apiKeySet) {
          setIsApiKeyMissing(true);
        }
      } catch (err) {
        console.error('Initial health check failed:', err);
      }
    };
    checkHealth();
  }, []);

  const handleUploadComplete = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setChunkCount(data.chunkCount);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const showStatus = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setApiStatus({ message, type });
    setTimeout(() => setApiStatus(null), 5000);
  };

  const testApi = async () => {
    console.log('Testing GET /api/health...');
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      console.log('GET Success:', data);
      showStatus(`API Status: ${data.status} (${data.timestamp})`, 'success');
    } catch (err: any) {
      console.error('GET Failed:', err);
      showStatus(`API Test Failed: ${err.message}`, 'error');
    }
  };

  const testPost = async () => {
    console.log('Testing POST /api/test-post...');
    try {
      const res = await fetch('/api/test-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: 'data' })
      });
      
      if (!res.ok) {
        const text = await res.text();
        console.error('POST Failed (HTML):', text);
        if (text.includes('Cookie check') || text.includes('Authenticate in new window')) {
          throw new Error('Action required: Your browser is blocking cookies. Please click "Authenticate in new window" if prompted, or open the app in a new tab.');
        }
        throw new Error(`Server returned HTML instead of JSON (Status ${res.status})`);
      }
      
      const data = await res.json();
      console.log('POST Success:', data);
      showStatus(`POST Test Success: Received ${JSON.stringify(data.received)}`, 'success');
    } catch (err: any) {
      console.error('POST Failed:', err);
      showStatus(`POST Test Failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Status Banner */}
      <AnimatePresence>
        {isApiKeyMissing && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-amber-50 border-b border-amber-200 px-6 py-2"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-medium">
                <AlertTriangle className="w-4 h-4" />
                <span>MY_GEMINI_API_KEY is missing. Please add it to your Secrets in AI Studio to enable AI features.</span>
              </div>
              <button 
                onClick={() => setIsApiKeyMissing(false)}
                className="text-amber-500 hover:text-amber-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
        {apiStatus && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full shadow-2xl text-sm font-semibold flex items-center gap-3",
              apiStatus.type === 'success' ? "bg-emerald-600 text-white" : 
              apiStatus.type === 'error' ? "bg-rose-600 text-white" : "bg-zinc-900 text-white"
            )}
          >
            {apiStatus.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
            {apiStatus.type === 'error' && <X className="w-5 h-5" />}
            {apiStatus.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">MindVault</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={testApi} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider">Test GET</button>
            <button onClick={testPost} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider">Test POST</button>
            <a href="#" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">Documentation</a>
            <a href="#" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">API</a>
            <div className="h-4 w-px bg-zinc-200" />
            <button className="p-2 text-zinc-500 hover:text-zinc-900 transition-colors">
              <Github className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Controls & Info */}
          <div className="lg:col-span-4 space-y-8">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
                Your Personal <span className="text-indigo-600">Knowledge Vault</span>
              </h1>
              <p className="text-zinc-500 leading-relaxed">
                Upload your documents and chat with them. MindVault uses RAG to provide grounded, accurate answers based on your data.
              </p>
            </div>

            <div className="space-y-6">
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 uppercase tracking-wider">
                  <FileText className="w-4 h-4" />
                  Knowledge Source
                </div>
                <FileUpload onUploadComplete={handleUploadComplete} />
              </section>

              <section className="p-6 bg-white border border-zinc-200 rounded-2xl space-y-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 uppercase tracking-wider">
                  <Layout className="w-4 h-4" />
                  Vault Statistics
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                    <p className="text-xs text-zinc-500 font-medium">Indexed Chunks</p>
                    <p className="text-2xl font-bold text-zinc-900">{chunkCount}</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                    <p className="text-xs text-zinc-500 font-medium">Status</p>
                    <p className="text-2xl font-bold text-emerald-600">Active</p>
                  </div>
                </div>
              </section>

              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex gap-3">
                <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-900 leading-relaxed">
                  MindVault processes your files locally and uses Gemini for embeddings and generation. Your data stays in your browser session.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Chat Interface */}
          <div className="lg:col-span-8">
            <ChatInterface />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-12 mt-12 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-zinc-400" />
            <span className="font-semibold text-zinc-900">MindVault AI</span>
          </div>
          <p className="text-sm text-zinc-500">
            © 2026 MindVault. Built with Gemini 3 Flash & RAG.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-sm text-zinc-500 hover:text-zinc-900">Privacy</a>
            <a href="#" className="text-sm text-zinc-500 hover:text-zinc-900">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

