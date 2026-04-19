export interface DocumentChunk {
  text: string;
  embedding: number[];
  filename: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}
