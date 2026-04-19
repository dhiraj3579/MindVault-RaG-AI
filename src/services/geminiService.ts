import { GoogleGenAI } from "@google/genai";

// Initialize Gemini on the frontend
const apiKey = process.env.MY_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is missing. AI features will not work.");
}
const genAI = new GoogleGenAI({ apiKey: apiKey || 'missing-key' });

export interface DocumentChunk {
  text: string;
  embedding: number[];
  filename: string;
}

const EMBEDDING_MODEL = "gemini-embedding-2-preview";
const CHAT_MODEL = "gemini-3-flash-preview";

export const geminiService = {
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await genAI.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: texts,
    });
    if (!response.embeddings) throw new Error("No embeddings returned from Gemini");
    return response.embeddings.map(e => e.values);
  },

  async getChatResponse(message: string, context: string): Promise<string> {
    const prompt = `You are a helpful knowledge assistant. Answer the question based ONLY on the provided context. If the answer is not in the context, say you don't know based on the documents.

Context:
${context}

Question:
${message}`;

    const result = await genAI.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
    });
    return result.text || "No response generated.";
  }
};

export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
