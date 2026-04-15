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

console.log('--- Server starting up ---');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Initialize Gemini
const apiKey = process.env.MY_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('!!! WARNING: MY_GEMINI_API_KEY is not set. AI features will not work.');
  console.warn('!!! Please add MY_GEMINI_API_KEY to your secrets in AI Studio.');
}
const ai = new GoogleGenAI({ apiKey: apiKey || 'missing-key' });

// In-memory RAG storage (simplified for demo)
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

// Request logging middleware
app.use((req, res, next) => {
  if (!req.url.startsWith('/@vite') && !req.url.startsWith('/src')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Health check
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    apiKeySet: !!(process.env.MY_GEMINI_API_KEY || process.env.GEMINI_API_KEY)
  });
});

// Simple POST test without multer
app.post('/api/test-post', (req, res) => {
  console.log('Test POST hit:', req.body);
  res.json({ status: 'ok', received: req.body });
});

// API Route for parsing files
app.post('/api/parse', upload.single('file'), async (req: any, res: any) => {
  const filename = req.file?.originalname || 'unknown';
  console.log(`>>> Parsing request for: ${filename} (${req.file?.mimetype})`);
  
  try {
    if (!req.file) {
      console.error('!!! No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, mimetype } = req.file;
    let text = '';

    if (mimetype === 'application/pdf') {
      console.log(`--- Processing PDF: ${filename} (${buffer.length} bytes)`);
      try {
        // With require, pdf is the function directly
        const parseFn = pdf;
        
        if (typeof parseFn !== 'function') {
          console.error('!!! pdf-parse is not a function. Type:', typeof parseFn, 'Value:', parseFn);
          throw new Error('PDF parsing library failed to load correctly');
        }

        console.log('Starting PDF extraction...');
        const data = await (parseFn as any)(buffer);
        console.log(`PDF extraction complete. Extracted ${data?.text?.length || 0} characters.`);
        text = data.text;
      } catch (pdfErr: any) {
        console.error(`!!! PDF Parse Error for ${filename}:`, pdfErr);
        return res.status(422).json({ error: `Failed to read PDF content: ${pdfErr.message}` });
      }
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      console.log(`--- Processing DOCX: ${filename}`);
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (mimetype === 'text/plain') {
      console.log(`--- Processing TXT: ${filename}`);
      text = buffer.toString('utf-8');
    } else {
      console.error(`!!! Unsupported mimetype: ${mimetype}`);
      return res.status(400).json({ error: `Unsupported file type: ${mimetype}` });
    }

    if (!text || text.trim().length === 0) {
      console.warn(`??? No text extracted from ${filename}`);
      return res.status(400).json({ error: 'No text could be extracted from this file. It might be an image-based PDF or empty.' });
    }

    // Automatically ingest into RAG
    console.log(`--- Ingesting ${filename} into RAG...`);
    const textChunks = chunkText(text);
    const embeddings = await generateEmbeddings(textChunks);
    const newChunks = textChunks.map((t, i) => ({
      text: t,
      embedding: embeddings[i],
      filename
    }));
    documentChunks.push(...newChunks);

    console.log(`<<< Successfully parsed and ingested ${text.length} characters from ${filename}`);
    res.json({ text, filename, chunkCount: documentChunks.length });
  } catch (error: any) {
    console.error(`!!! Error parsing ${filename}:`, error);
    
    // Check for API key errors during embedding generation
    if (error.message?.includes('API key not valid') || error.message?.includes('API_KEY_INVALID')) {
      const isVercel = process.env.VERCEL === '1';
      const envVarName = 'MY_GEMINI_API_KEY';
      return res.status(401).json({ 
        error: `Invalid Gemini API Key. ${isVercel ? `On Vercel, please ensure you have added the ${envVarName} environment variable in your project settings.` : `Please check your ${envVarName} in your secrets in AI Studio.`}` 
      });
    }

    res.status(500).json({ error: `Failed to parse file: ${error.message || 'Unknown error'}` });
  }
});

app.post('/api/chat', async (req: any, res: any) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    console.log(`>>> Chat request: ${message.slice(0, 50)}...`);
    
    // 1. Retrieve
    if (documentChunks.length === 0) {
      return res.json({ 
        content: "I don't have any documents in my vault yet. Please upload some files first!",
        sources: [] 
      });
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

    // 2. Generate
    const prompt = `
      You are a helpful AI Knowledge Assistant. Use the following pieces of retrieved context to answer the user's question.
      If you don't know the answer based on the context, just say that you don't know, don't try to make up an answer.
      
      Context:
      ${context}
      
      Question: ${message}
      
      Answer:
    `;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional RAG assistant. Be concise and accurate. Always cite your sources if possible."
      }
    });

    console.log(`<<< Chat response generated (${result.text?.length || 0} chars)`);
    res.json({ content: result.text, sources });
  } catch (error: any) {
    console.error('!!! Chat Error:', error);
    
    // Check for API key errors
    if (error.message?.includes('API key not valid') || error.message?.includes('API_KEY_INVALID')) {
      const isVercel = process.env.VERCEL === '1';
      const envVarName = 'MY_GEMINI_API_KEY';
      return res.status(401).json({ 
        error: `Invalid Gemini API Key. ${isVercel ? `On Vercel, please ensure you have added the ${envVarName} environment variable in your project settings.` : `Please check your ${envVarName} in your secrets in AI Studio.`}` 
      });
    }
    
    res.status(500).json({ error: `Failed to generate response: ${error.message}` });
  }
});

app.post('/api/clear', (req, res) => {
  documentChunks = [];
  res.json({ status: 'ok', chunkCount: 0 });
});

app.get('/api/stats', (req, res) => {
  res.json({ chunkCount: documentChunks.length });
});

// Catch-all for unmatched API routes
app.use('/api/*', (req, res) => {
  console.log(`!!! Unmatched API request: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Vite middleware for development
async function setupVite(app: any) {
  console.log(`--- Setting up Vite (NODE_ENV: ${process.env.NODE_ENV}) ---`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('--- Importing Vite ---');
    const { createServer: createViteServer } = await import('vite');
    console.log('--- Creating Vite Server ---');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    console.log('--- Vite Server Created, using middlewares ---');
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    console.log(`--- Serving static files from: ${distPath} ---`);
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('!!! Global Error Handler:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Export for Vercel
export default app;

// Start server if running directly
if (process.env.NODE_ENV !== 'production' || process.env.VITE_START_SERVER === 'true') {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT} - Initializing Vite...`);
    setupVite(app).then(() => {
      console.log('Vite initialization complete.');
    }).catch(err => {
      console.error('Vite initialization failed:', err);
    });
  });
} else {
  // In production (Vercel), we still need to set up the static routes
  // but we don't call app.listen()
  console.log('Production mode: Initializing routes...');
  setupVite(app).then(() => {
    console.log('Production routes initialized.');
  }).catch(err => {
    console.error('Production route initialization failed:', err);
  });
}
