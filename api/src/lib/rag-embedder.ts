import type { Env } from '../env';

/**
 * Content chunk metadata — stored alongside the vector so we can trace
 * every retrieved result back to a source.
 */
export interface ChunkMeta {
  source_id: string; // e.g. "telegram-leak-123", "cve-CVE-2024-1709"
  source_type:
    | 'telegram_leak'
    | 'breach'
    | 'cve'
    | 'actor_kb'
    | 'ransomware_claim'
    | 'ioc_feed'
    | 'writeup'
    | 'briefing'
    | 'negotiation'
    | 'intel_report';
  title: string;
  url?: string;
  text: string;
  chunk_index: number;
  total_chunks: number;
  timestamp: string;
  tags: string[];
}

const CHUNK_SIZE = 512; // characters per chunk
const CHUNK_OVERLAP = 64;
const BATCH_SIZE = 50; // vectors per insert batch
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'; // 768-dim, free via Workers AI

/**
 * Split text into overlapping chunks with metadata.
 */
export function chunkText(text: string, meta: Omit<ChunkMeta, 'chunk_index' | 'total_chunks'>): ChunkMeta[] {
  if (!text || text.length < 10) return [];
  const chunks: ChunkMeta[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + CHUNK_SIZE, text.length);
    // Try to break at a sentence boundary near the chunk end
    let breakAt = end;
    if (end < text.length) {
      const after = text.slice(end - 40, end + 40);
      const sentenceEnd = after.search(/[.!?]\s[A-Z]/);
      if (sentenceEnd > 0 && sentenceEnd < 60) breakAt = end - 40 + sentenceEnd + 1;
      else breakAt = end;
    }
    const segment = text.slice(i, breakAt).trim();
    if (segment.length >= 10) {
      chunks.push({
        ...meta,
        chunk_index: chunks.length,
        total_chunks: 0, // filled below
        text: segment,
      });
    }
    i = breakAt - (breakAt < text.length ? CHUNK_OVERLAP : 0);
  }
  // Fill total_chunks
  for (const c of chunks) c.total_chunks = chunks.length;
  return chunks;
}

/**
 * Embed text with Workers AI and return the vector.
 */
async function embedText(ai: Ai, text: string): Promise<number[]> {
  const res = (await ai.run(EMBEDDING_MODEL, {
    text: [text.slice(0, 2000)], // model context limit
  })) as { data?: Array<{ embedding?: number[] }> };
  return res.data?.[0]?.embedding ?? [];
}

/**
 * Chunk + embed + insert a document into Vectorize.
 * Returns the number of vectors inserted.
 */
export async function indexDocument(env: Env, meta: Omit<ChunkMeta, 'chunk_index' | 'total_chunks'>): Promise<number> {
  const ai = env.AI;
  const vec = env.VECTORIZE;
  if (!ai || !vec || !meta.text) return 0;

  const chunks = chunkText(meta.text, meta);
  if (chunks.length === 0) return 0;

  let inserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors: Array<{ id: string; values: number[]; metadata: Record<string, string> }> = [];

    for (const chunk of batch) {
      const embedding = await embedText(ai, chunk.text);
      if (embedding.length === 0) continue;

      vectors.push({
        id: `${chunk.source_id}__chunk${chunk.chunk_index}`,
        values: embedding,
        metadata: {
          source_id: chunk.source_id,
          source_type: chunk.source_type,
          title: chunk.title.slice(0, 200),
          url: chunk.url ?? '',
          chunk_index: String(chunk.chunk_index),
          total_chunks: String(chunk.total_chunks),
          timestamp: chunk.timestamp,
          tags: chunk.tags.join(','),
          text: chunk.text.slice(0, 500),
        },
      });
    }

    if (vectors.length > 0) {
      try {
        await vec.insert(vectors);
        inserted += vectors.length;
      } catch (err) {
        console.error('Vectorize insert error:', err);
      }
    }
  }

  return inserted;
}

/**
 * Query Vectorize with an embedding, returning the top-k most similar chunks.
 */
export async function queryCorpus(
  env: Env,
  query: string,
  topK = 8,
  typeFilter?: string
): Promise<Array<{ score: number; metadata: Record<string, string> }>> {
  const ai = env.AI;
  const vec = env.VECTORIZE;
  if (!ai || !vec) return [];

  const embedding = await embedText(ai, query);
  if (embedding.length === 0) return [];

  const result = (await vec.query(embedding, {
    topK,
    returnMetadata: 'all',
    filter: typeFilter ? { source_type: typeFilter } : undefined,
  })) as { matches?: Array<{ score: number; metadata?: Record<string, string> }> };

  const matches = result.matches ?? [];
  return matches
    .filter((m) => m.score > 0.4)
    .map((m) => ({
      score: m.score,
      metadata: (m.metadata ?? {}) as Record<string, string>,
    }));
}

/**
 * Format retrieved contexts into an XML block for the LLM prompt.
 */
export function formatRetrievedContext(results: Array<{ score: number; metadata: Record<string, string> }>): string {
  if (results.length === 0) return '';

  const parts = results.map((r, i) => {
    const m = r.metadata;
    return `<context ref="R${i + 1}" score="${r.score.toFixed(3)}" source="${m.source_type ?? 'unknown'}" title="${m.title ?? ''}" url="${m.url ?? ''}">\n${m.text ?? ''}\n</context>`;
  });

  return [
    '<retrieved_corpus>',
    `The following contexts were retrieved from the intelligence corpus (score = cosine similarity):`,
    ...parts,
    '</retrieved_corpus>',
    '',
    '## Critical Instructions',
    '- You MAY ONLY cite claims that appear in the retrieved contexts above.',
    '- Every factual claim MUST reference its context ref number like [R1], [R2], etc.',
    '- If the retrieved contexts do not contain enough information to answer, say so clearly.',
    '- Do NOT invent IOCs, attribution, CVEs, or any technical detail not present in the contexts.',
  ].join('\n');
}
