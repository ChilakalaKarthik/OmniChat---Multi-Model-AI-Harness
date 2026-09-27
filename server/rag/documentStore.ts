import crypto from 'crypto';

export interface DocumentRecord {
  docId: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  text: string;
  chunks: string[];
  createdAt: number;
}

// In-memory document storage keyed by docId (ephemeral for current server lifecycle)
const store = new Map<string, DocumentRecord>();

// Basic stop words to exclude from keyword overlap scoring
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for',
  'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'll',
  'm', 'me', 'might', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'o', 'of', 'off',
  'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 're', 's',
  'same', 'she', 'should', 'so', 'some', 'such', 't', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 've', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'whom', 'why', 'will', 'with', 'won', 'would', 'y', 'you', 'your', 'yours'
]);

/**
 * Split document text into ~1,500 character chunks with slight boundary tolerance.
 */
export function chunkDocument(text: string, targetSize = 1500): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= targetSize) {
    return [normalized];
  }

  const chunks: string[] = [];
  const paragraphs = normalized.split(/\n\s*\n/);
  let currentChunk = '';

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // If single paragraph is larger than targetSize, split by sentence or length
    if (trimmedPara.length > targetSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      const sentences = trimmedPara.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [trimmedPara];
      let subChunk = '';
      for (const sent of sentences) {
        if ((subChunk + sent).length > targetSize && subChunk.length > 200) {
          chunks.push(subChunk.trim());
          subChunk = sent;
        } else {
          subChunk += sent;
        }
      }
      if (subChunk.trim()) {
        chunks.push(subChunk.trim());
      }
      continue;
    }

    if ((currentChunk + '\n\n' + trimmedPara).length > targetSize && currentChunk.length > 200) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmedPara;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedPara : trimmedPara;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text.slice(0, targetSize)];
}

/**
 * Naive keyword overlap RAG matcher:
 * Extracts keywords from question, scores chunks by keyword presence, returns top 6 chunks.
 */
export function findTopChunks(chunks: string[], query: string, topK = 6): string[] {
  if (!chunks || chunks.length === 0) return [];
  if (chunks.length <= topK) return chunks;

  const rawTokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const uniqueTokens = Array.from(new Set(rawTokens));

  if (uniqueTokens.length === 0) {
    // Return first 6 chunks if query has no specific keywords
    return chunks.slice(0, topK);
  }

  const scored = chunks.map((chunk, index) => {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const token of uniqueTokens) {
      // Count matches of this keyword in the chunk
      let pos = 0;
      while ((pos = lower.indexOf(token, pos)) !== -1) {
        score += 1;
        pos += token.length;
      }
    }
    return { chunk, score, index };
  });

  // Sort by score descending; if tied, retain original document order
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return scored.slice(0, topK).map((s) => s.chunk);
}

export function saveDocument(
  filename: string,
  fileType: string,
  sizeBytes: number,
  text: string
): DocumentRecord {
  const docId = 'doc_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  const chunks = chunkDocument(text);

  const record: DocumentRecord = {
    docId,
    filename,
    fileType,
    sizeBytes,
    text,
    chunks,
    createdAt: Date.now(),
  };

  store.set(docId, record);
  return record;
}

export function getDocument(docId: string): DocumentRecord | undefined {
  return store.get(docId);
}

export function deleteDocument(docId: string): boolean {
  return store.delete(docId);
}
