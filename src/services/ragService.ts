import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface DocumentChunk {
  text: string;
  embedding: number[];
  filename: string;
}

export class RAGService {
  private chunks: DocumentChunk[] = [];

  /**
   * Chunks text into smaller pieces with overlap
   */
  private chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start += chunkSize - overlap;
    }
    
    return chunks;
  }

  /**
   * Generates embeddings for a list of text chunks
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Gemini embedding API supports batching
    const response = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: texts
    });

    if (!response.embeddings) {
      throw new Error("Failed to generate embeddings: No embeddings returned");
    }

    return response.embeddings.map(e => e.values);
  }

  /**
   * Adds a document to the knowledge base
   */
  async addDocument(text: string, filename: string) {
    const textChunks = this.chunkText(text);
    const embeddings = await this.generateEmbeddings(textChunks);

    const newChunks = textChunks.map((text, i) => ({
      text,
      embedding: embeddings[i],
      filename
    }));

    this.chunks.push(...newChunks);
  }

  /**
   * Calculates cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
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

  /**
   * Retrieves relevant chunks for a query
   */
  async retrieve(query: string, topK: number = 3): Promise<DocumentChunk[]> {
    if (this.chunks.length === 0) return [];

    const queryEmbeddingResponse = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [query]
    });
    
    if (!queryEmbeddingResponse.embeddings || queryEmbeddingResponse.embeddings.length === 0) {
      throw new Error("Failed to generate query embedding");
    }

    const queryEmbedding = queryEmbeddingResponse.embeddings[0].values;

    const scoredChunks = this.chunks.map(chunk => ({
      chunk,
      score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    // Sort by score descending and take topK
    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.chunk);
  }

  clear() {
    this.chunks = [];
  }

  getChunkCount() {
    return this.chunks.length;
  }
}

export const ragService = new RAGService();
