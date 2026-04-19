import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import cors from 'cors';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Lazy-loaded pdf-parse to prevent initial startup crash
let pdf: any;
function getPdfParser() {
  if (!pdf) {
    pdf = require('pdf-parse');
  }
  return pdf;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simple parsing route - NO GEMINI HERE
app.post('/api/parse', upload.single('file'), async (req: any, res: any) => {
  const filename = req.file?.originalname || 'unknown';
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { buffer, mimetype } = req.file;
    let text = '';

    if (mimetype === 'application/pdf') {
      const data = await getPdfParser()(buffer);
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

    // Return raw text for frontend to embed
    res.json({ text, filename });
  } catch (error: any) {
    console.error(`Error parsing ${filename}:`, error);
    res.status(500).json({ error: error.message || 'Failed to parse file' });
  }
});

export default app;
