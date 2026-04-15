import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pdf: any;
try {
  pdf = require('pdf-parse');
  console.log('--- pdf-parse library loaded successfully ---');
} catch (err) {
  console.error('!!! Failed to load pdf-parse library:', err);
}
import mammoth from 'mammoth';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Initialize Gemini
const apiKey = process.env.MY_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || 'missing-key' });

// In-memory RAG storage
interface DocumentChunk {
  text: string;
  embedding: number[];
  filename: string;
}
let documentChunks: DocumentChunk[] = [];

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: texts
  });
  if (!response.embeddings) throw new Error("No embeddings returned");
  return response.embeddings.map(e => e.values);
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      // Apply Vite middleware BEFORE other routes
      app.use(vite.middlewares);
    } catch (e) {
      console.warn('Vite not found, skipping middleware');
    }

    const PORT = 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    apiKeySet: !!(process.env.MY_GEMINI_API_KEY || process.env.GEMINI_API_KEY),
    environment: process.env.VERCEL ? 'vercel' : 'development'
  });
});

app.post('/api/test-post', (req, res) => {
  res.json({ status: 'ok', received: req.body });
});

app.post('/api/parse', upload.single('file'), async (req: any, res: any) => {
  const filename = req.file?.originalname || 'unknown';
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { buffer, mimetype } = req.file;
    let text = '';

    if (mimetype === 'application/pdf') {
      const data = await (pdf as any)(buffer);
      text = data.text;
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (mimetype === 'text/plain') {
      text = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No text could be extracted' });
    }

    const textChunks = chunkText(text);
    const embeddings = await generateEmbeddings(textChunks);
    const newChunks = textChunks.map((t, i) => ({
      text: t,
      embedding: embeddings[i],
      filename
    }));
    documentChunks.push(...newChunks);

    res.json({ text: text.slice(0, 500), filename, chunkCount: documentChunks.length });
  } catch (error: any) {
    console.error(`Error parsing ${filename}:`, error);
    res.status(500).json({ error: error.message || 'Failed to parse file' });
  }
});

app.post('/api/chat', async (req: any, res: any) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    if (documentChunks.length === 0) {
      return res.json({ content: "Please upload some files first!", sources: [] });
    }

    const queryEmbeddingResponse = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [message]
    });
    const queryEmbedding = queryEmbeddingResponse.embeddings[0].values;

    const scoredChunks = documentChunks.map(chunk => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    const relevantChunks = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.chunk);

    const context = relevantChunks.map(c => c.text).join('\n\n');
    const sources = Array.from(new Set(relevantChunks.map(c => c.filename)));

    const prompt = `Context:\n${context}\n\nQuestion: ${message}`;
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    res.json({ content: result.text, sources });
  } catch (error: any) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clear', (req, res) => {
  documentChunks = [];
  res.json({ status: 'ok', chunkCount: 0 });
});

app.get('/api/stats', (req, res) => {
  res.json({ chunkCount: documentChunks.length });
});

export default app;
