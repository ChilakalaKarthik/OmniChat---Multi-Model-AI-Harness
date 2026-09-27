import path from 'path';
import mammoth from 'mammoth';

export interface ParseResult {
  text: string;
  filename: string;
  extension: string;
  sizeBytes: number;
}

export async function parseUploadedDocument(
  buffer: Buffer,
  originalFilename: string
): Promise<ParseResult> {
  const extension = path.extname(originalFilename).toLowerCase();
  const sizeBytes = buffer.length;

  // 15MB file size limit check
  const MAX_SIZE = 15 * 1024 * 1024;
  if (sizeBytes > MAX_SIZE) {
    throw new Error('File too large — max 15MB');
  }

  let text = '';

  if (extension === '.pdf') {
    try {
      // Dynamic import to handle both ESM and CommonJS exports
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const pdfData = await pdfParse(buffer);
      text = (pdfData?.text || '').trim();
    } catch (err: unknown) {
      console.error('[OmniChat RAG] PDF parse error:', err);
      throw new Error("Couldn't read any text from this file");
    }
  } else if (extension === '.docx') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = (result.value || '').trim();
    } catch (err: unknown) {
      console.error('[OmniChat RAG] DOCX parse error:', err);
      throw new Error("Couldn't read any text from this file");
    }
  } else if (extension === '.txt' || extension === '.md') {
    text = buffer.toString('utf-8').trim();
  } else {
    throw new Error('Only PDF, DOCX, TXT supported');
  }

  // Check if text could be extracted (e.g. scanned image PDF without OCR)
  if (!text || text.length === 0) {
    throw new Error("Couldn't read any text from this file");
  }

  return {
    text,
    filename: originalFilename,
    extension,
    sizeBytes,
  };
}
