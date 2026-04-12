import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
        // Use the standard pdf-parse (v1.1.1)
        // With require, 'pdf' is the function directly
        const parseFn = pdf;
        
        if (typeof parseFn !== 'function') {
          console.error('!!! pdf-parse is not a function. Type:', typeof parseFn);
          throw new Error('PDF parsing library failed to load correctly');
        }

        console.log('Starting PDF extraction...');
        // pdf-parse can be slow, so we log before and after
        const data = await parseFn(buffer);
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

    console.log(`<<< Successfully parsed ${text.length} characters from ${filename}`);
    res.json({ text, filename });
  } catch (error: any) {
    console.error(`!!! Error parsing ${filename}:`, error);
    res.status(500).json({ error: `Failed to parse file: ${error.message || 'Unknown error'}` });
  }
});

// Catch-all for unmatched API routes
app.use('/api/*', (req, res) => {
  console.log(`!!! Unmatched API request: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Vite middleware for development
async function setupVite(app: any) {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
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
  setupVite(app).then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
} else {
  // In production (Vercel), we don't need setupVite because vercel.json
  // handles static files and rewrites. This keeps the function slim.
  console.log('Production mode: Serverless function initialized');
}
