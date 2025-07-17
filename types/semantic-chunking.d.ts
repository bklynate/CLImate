declare module 'semantic-chunking' {
  export interface ChunkOptions {
    maxTokenSize?: number;
    chunkPrefix?: string;
    returnEmbedding?: boolean;
    returnTokenLength?: boolean;
    onnxEmbeddingModelQuantized?: boolean;
    dtype?: string;
    device?: string;
  }

  export interface Chunk {
    text: string;
    embedding?: number[];
    tokenLength?: number;
  }

  export function cramit(text: string, options?: ChunkOptions): Promise<Chunk[]>;
  export function chunkit(text: string, options?: ChunkOptions): Promise<Chunk[]>;
  export function sentenceit(text: string): Promise<string[]>;
}