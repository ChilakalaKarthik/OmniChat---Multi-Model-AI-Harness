import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { handleChatStream } from './server/chatHandler';
import { testProviderApiKey } from './server/keyTester';
import { parseUploadedDocument } from './server/rag/fileParser';
import { saveDocument, getDocument } from './server/rag/documentStore';
import { searchTavily } from './server/search/tavily';
import { verifyProviderModels } from './server/modelVerifier';
import { testGmailConnection, fetchInboxMessages, fetchFullMessage } from './server/gmail/imap';
import { generateEmailDraftReply } from './server/gmail/draftHelper';
import { ProviderId } from './server/providers/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Configure Multer for in-memory file uploads with 15MB limit
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'OmniChat Express Gateway',
      phase: 3,
      time: new Date().toISOString(),
    });
  });

  // Real API Key verification endpoint
  app.post('/api/keys/test', async (req: Request, res: Response) => {
    const { provider, apiKey } = req.body;

    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ ok: false, reason: 'Provider is required' });
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ ok: false, reason: 'API key cannot be empty' });
    }

    try {
      const result = await testProviderApiKey(provider as any, apiKey);
      if (result.ok) {
        return res.json({ ok: true, provider, message: result.message });
      } else {
        return res.status(400).json({ ok: false, provider, reason: result.reason });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal key verification error';
      return res.status(500).json({ ok: false, provider, reason: message });
    }
  });

  // Verify available models on user's connected account
  app.post('/api/models/verify', async (req: Request, res: Response) => {
    const { provider, apiKey, keys } = req.body || {};

    if (keys && typeof keys === 'object') {
      const results: Record<string, any> = {};
      const providers = Object.keys(keys) as ProviderId[];

      await Promise.all(
        providers.map(async (p) => {
          const key = keys[p];
          if (key && typeof key === 'string' && key.trim()) {
            results[p] = await verifyProviderModels(p, key);
          }
        })
      );

      return res.json({ ok: true, results });
    }

    if (!provider || !apiKey) {
      return res.status(400).json({ ok: false, error: 'Provider and apiKey are required' });
    }

    try {
      const result = await verifyProviderModels(provider as ProviderId, apiKey);
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Model verification error';
      return res.status(500).json({ ok: false, provider, error: message });
    }
  });

  // Phase 3: RAG Document Upload Endpoint
  app.post('/api/document/upload', (req: Request, res: Response) => {
    upload.single('file')(req, res, async (err: any) => {
      // Catch Multer limit errors
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            ok: false,
            error: 'File too large — max 15MB',
          });
        }
        return res.status(400).json({
          ok: false,
          error: err.message || 'File upload error',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'No file uploaded',
        });
      }

      try {
        const parsed = await parseUploadedDocument(req.file.buffer, req.file.originalname);
        const record = saveDocument(
          parsed.filename,
          parsed.extension,
          parsed.sizeBytes,
          parsed.text
        );

        return res.json({
          ok: true,
          docId: record.docId,
          filename: record.filename,
          chunkCount: record.chunks.length,
          sizeBytes: record.sizeBytes,
        });
      } catch (parseErr: unknown) {
        const message = parseErr instanceof Error ? parseErr.message : 'Failed to parse file';
        return res.status(400).json({
          ok: false,
          error: message,
        });
      }
    });
  });

  // Document details lookup
  app.get('/api/document/:docId', (req: Request, res: Response) => {
    const doc = getDocument(req.params.docId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: 'Document not found' });
    }
    return res.json({
      ok: true,
      docId: doc.docId,
      filename: doc.filename,
      chunkCount: doc.chunks.length,
      sizeBytes: doc.sizeBytes,
    });
  });

  // Phase 4: Tavily Web Search Proxy Endpoint
  app.post('/api/search', async (req: Request, res: Response) => {
    const { query, tavilyKey, apiKey } = req.body || {};
    const q = String(query || '').trim();
    const key = String(tavilyKey || apiKey || '').trim();

    if (!q) {
      return res.status(400).json({ ok: false, error: 'Query parameter is required' });
    }

    try {
      const result = await searchTavily(q, key);
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search error';
      return res.status(500).json({ ok: false, error: message });
    }
  });

  app.get('/api/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || req.query.query || '').trim();
    const key = String(req.query.tavilyKey || req.query.apiKey || '').trim();

    if (!q) {
      return res.status(400).json({ ok: false, error: 'Query parameter "q" is required' });
    }

    try {
      const result = await searchTavily(q, key);
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search error';
      return res.status(500).json({ ok: false, error: message });
    }
  });

  // Part 3: Gmail IMAP Routes (Connect, Fetch Messages, Draft Reply)
  app.post('/api/gmail/connect', async (req: Request, res: Response) => {
    const { email, appPassword } = req.body || {};
    if (!email || !appPassword) {
      return res.status(400).json({
        ok: false,
        error: 'Gmail address and App Password are required.',
      });
    }

    const result = await testGmailConnection(email, appPassword);
    if (!result.ok) {
      return res.status(401).json(result);
    }
    return res.json(result);
  });

  app.post('/api/gmail/messages', async (req: Request, res: Response) => {
    const { email, appPassword, limit } = req.body || {};
    if (!email || !appPassword) {
      return res.status(400).json({
        ok: false,
        error: 'Gmail address and App Password are required.',
      });
    }

    const result = await fetchInboxMessages(email, appPassword, Number(limit) || 10);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });

  app.post('/api/gmail/message', async (req: Request, res: Response) => {
    const { email, appPassword, messageId } = req.body || {};
    if (!email || !appPassword || !messageId) {
      return res.status(400).json({
        ok: false,
        error: 'Email, App Password, and messageId are required.',
      });
    }

    const result = await fetchFullMessage(email, appPassword, String(messageId));
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });

  app.post('/api/gmail/draft-reply', async (req: Request, res: Response) => {
    const { email, appPassword, messageId, promptInstructions, provider, model, apiKey } =
      req.body || {};
    if (!email || !appPassword || !messageId) {
      return res.status(400).json({
        ok: false,
        error: 'Email, App Password, and messageId are required.',
      });
    }

    try {
      const msgResult = await fetchFullMessage(email, appPassword, String(messageId));
      if (!msgResult.ok || !msgResult.message) {
        return res.status(400).json({
          ok: false,
          error: msgResult.error || 'Failed to fetch original message for drafting.',
        });
      }

      const draftText = await generateEmailDraftReply({
        message: msgResult.message,
        userPrompt: promptInstructions,
        provider,
        model,
        apiKey,
      });

      return res.json({
        ok: true,
        draft: draftText,
        subject: msgResult.message.subject.startsWith('Re:')
          ? msgResult.message.subject
          : `Re: ${msgResult.message.subject}`,
        originalMessage: {
          id: msgResult.message.id,
          subject: msgResult.message.subject,
          from: msgResult.message.from,
          date: msgResult.message.date,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Draft generation error';
      return res.status(500).json({ ok: false, error: message });
    }
  });

  // Real Chat Streaming Route via Server-Sent Events
  app.post('/api/chat', (req: Request, res: Response) => {
    handleChatStream(req, res);
  });

  // Setup static serving or Vite middleware
  const isProduction = process.env.NODE_ENV !== 'development';

  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OmniChat] Server running at http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[OmniChat] Failed to start server:', err);
  process.exit(1);
});
