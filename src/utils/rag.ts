/**
 * RAG (Retrieval-Augmented Generation) Helper Utilities
 * Implements client-side text chunking, embedding retrieval, and cosine similarity calculations.
 */

// Helper to chunk text
export function chunkText(text: string, maxChunkSize = 1000, overlap = 200): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkSize;
    if (endIndex > text.length) {
      endIndex = text.length;
    } else {
      // Try to break at space or newline to avoid cutting words
      const lastSpace = text.lastIndexOf(' ', endIndex);
      const lastNewline = text.lastIndexOf('\n', endIndex);
      const breakPoint = Math.max(lastSpace, lastNewline);
      if (breakPoint > startIndex + maxChunkSize / 2) {
        endIndex = breakPoint;
      }
    }

    chunks.push(text.slice(startIndex, endIndex).trim());
    startIndex = endIndex - overlap;
    
    // Prevent infinite loop in edge cases
    if (overlap >= maxChunkSize || startIndex >= text.length) {
      startIndex = endIndex;
    }
  }

  return chunks.filter(c => c.length > 0);
}

// Compute cosine similarity between two vectors
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
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

// Call /api/embeddings endpoint in batch
export async function fetchEmbeddings(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  
  try {
    const res = await fetch('/api/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: inputs }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Embedding API error: ${errText}`);
    }

    const data = await res.json();
    if (data && data.data && Array.isArray(data.data)) {
      // Sort to match original input order
      const sorted = [...data.data].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
      return sorted.map((item: any) => item.embedding);
    }
    throw new Error('Invalid response structure from embeddings API');
  } catch (error) {
    console.error('[RAG] Error fetching embeddings:', error);
    throw error;
  }
}

export interface ChunkWithEmbedding {
  text: string;
  embedding: number[];
}

// Retrieve relevant context chunks using query embedding
export async function retrieveRelevantContext(
  query: string,
  chunks: ChunkWithEmbedding[],
  topK = 5
): Promise<string> {
  if (!query.trim() || chunks.length === 0) return '';

  try {
    // 1. Embed query
    const queryEmbeddings = await fetchEmbeddings([query]);
    if (queryEmbeddings.length === 0) return '';
    const queryVector = queryEmbeddings[0];

    // 2. Score each chunk
    const scoredChunks = chunks.map(chunk => {
      const similarity = cosineSimilarity(queryVector, chunk.embedding);
      return { text: chunk.text, score: similarity };
    });

    // 3. Sort and pick top K
    const topChunks = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    console.log('[RAG] Selected top chunks with scores:', topChunks.map(c => c.score.toFixed(3)));

    // 4. Join context
    return topChunks.map(c => c.text).join('\n\n...\n\n');
  } catch (err) {
    console.error('[RAG] Failed to retrieve context, falling back to empty context:', err);
    return '';
  }
}
