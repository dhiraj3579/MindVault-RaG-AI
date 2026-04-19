import React, { useState, useRef } from 'react';
import { Upload, File, X, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { geminiService, chunkText } from '../services/geminiService';
import { DocumentChunk } from '../types';

interface FileUploadProps {
  onChunksParsed: (chunks: DocumentChunk[]) => void;
  onClear: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onChunksParsed, onClear }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [fileList, setFileList] = useState<{ name: string; status: 'pending' | 'success' | 'error'; error?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    setFileList([]);
    onClear();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    setIsUploading(true);
    const newFiles = Array.from(selectedFiles).map(f => ({ name: f.name, status: 'pending' as const }));
    setFileList(prev => [...prev, ...newFiles]);

    for (const file of Array.from(selectedFiles)) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        // 1. Send to backend for RAW parsing (PDF -> Text)
        const response = await fetch('/api/parse', { method: 'POST', body: formData });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to parse file');
        }

        const { text, filename } = await response.json();

        // 2. Local Chunking
        const textChunks = chunkText(text);

        // 3. Local Embedding via Gemini (Frontend SDK)
        const embeddings = await geminiService.generateEmbeddings(textChunks);

        const newChunks: DocumentChunk[] = textChunks.map((t, i) => ({
          text: t,
          embedding: embeddings[i],
          filename
        }));

        onChunksParsed(newChunks);
        setFileList(prev => prev.map(f => f.name === file.name ? { ...f, status: 'success' } : f));
      } catch (error: any) {
        console.error('Error uploading file:', error);
        setFileList(prev => prev.map(f => f.name === file.name ? { ...f, status: 'error', error: error.message } : f));
      }
    }

    setIsUploading(false);
  };

  return (
    <div className="space-y-4">
      <div 
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed border-zinc-200 rounded-xl p-8 text-center cursor-pointer transition-all hover:border-zinc-400 hover:bg-zinc-50",
          isUploading && "opacity-50 cursor-not-allowed"
        )}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          multiple 
          accept=".pdf,.docx,.txt"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="p-3 bg-zinc-100 rounded-full">
            <Upload className="w-6 h-6 text-zinc-600" />
          </div>
          <div>
            <p className="font-medium text-zinc-900">Click to upload or drag and drop</p>
            <p className="text-sm text-zinc-500">PDF, DOCX, or TXT (max 10MB)</p>
          </div>
        </div>
      </div>

      {fileList.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Uploaded Files</h4>
            <button 
              onClick={handleClear}
              className="text-xs text-rose-500 hover:text-rose-600 font-medium transition-colors"
            >
              Clear All
            </button>
          </div>
          {fileList.map((file, i) => (
            <div key={i} className="group relative">
              <div className="flex items-center justify-between p-3 bg-white border border-zinc-100 rounded-lg shadow-sm">
                <div className="flex items-center gap-3">
                  <File className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-700 truncate max-w-[200px]">{file.name}</span>
                </div>
                <div>
                  {file.status === 'pending' && <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />}
                  {file.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {file.status === 'error' && <X className="w-4 h-4 text-rose-500" />}
                </div>
              </div>
              {file.error && (
                <div className="mt-1 px-3 text-[10px] text-rose-500 font-medium italic">
                  {file.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
