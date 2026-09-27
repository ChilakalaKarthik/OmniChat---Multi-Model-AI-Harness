import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface GmailMessageSummary {
  id: string;
  seq: number;
  subject: string;
  from: string;
  fromName: string;
  date: string;
  snippet: string;
}

export interface GmailFullMessage {
  id: string;
  subject: string;
  from: string;
  to?: string;
  date: string;
  text: string;
  html?: string;
}

function cleanCredentials(email: string, appPassword: string) {
  const cleanEmail = (email || '').trim();
  // Strip all whitespace from 16-character Google App Passwords (e.g., "abcd efgh ijkl mnop" -> "abcdefghijklmnop")
  const cleanPass = (appPassword || '').replace(/\s+/g, '').trim();
  return { email: cleanEmail, pass: cleanPass };
}

function createClient(email: string, appPassword: string): ImapFlow {
  const { email: user, pass } = cleanCredentials(email, appPassword);
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user,
      pass,
    },
    logger: false,
    emitLogs: false,
    clientInfo: {
      name: 'OmniChat',
      version: '1.0.0',
    },
  });
}

function formatImapError(err: unknown): { error: string; code?: string } {
  const errObj = (err && typeof err === 'object' ? err : {}) as any;
  const message = err instanceof Error ? err.message : String(err);
  const responseText = String(errObj.responseText || '');
  console.warn('[Gmail IMAP] Error encountered:', message, responseText);

  const combined = `${message} ${responseText}`.toLowerCase();
  if (
    errObj.authenticationFailed === true ||
    errObj.responseStatus === 'NO' ||
    combined.includes('authenticationfailed') ||
    combined.includes('invalid credentials') ||
    combined.includes('username and password not accepted') ||
    combined.includes('please log in via your web browser') ||
    combined.includes('command failed') ||
    combined.includes('auth')
  ) {
    return {
      error: 'Authentication failed — check your email and app password. Make sure you are using a 16-character Google App Password with 2-Step Verification, not your regular password.',
      code: 'AUTH_FAILED',
    };
  }

  if (
    combined.includes('enotfound') ||
    combined.includes('econnrefused') ||
    combined.includes('etimedout') ||
    combined.includes('network') ||
    combined.includes('timeout')
  ) {
    return {
      error: "Couldn't reach Gmail — try again in a moment",
      code: 'NETWORK_ERROR',
    };
  }

  return {
    error: message || "Couldn't reach Gmail — try again in a moment",
    code: 'GENERAL_ERROR',
  };
}

/**
 * Test IMAP connection with Gmail App Password
 */
export async function testGmailConnection(
  email: string,
  appPassword: string
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const { email: cleanEmail, pass: cleanPass } = cleanCredentials(email, appPassword);
  if (!cleanEmail || !cleanPass) {
    return {
      ok: false,
      error: 'Email address and App Password are both required.',
    };
  }

  const client = createClient(cleanEmail, cleanPass);
  try {
    await client.connect();
    // Test mailbox access
    const lock = await client.getMailboxLock('INBOX');
    try {
      // mailbox is open and verified
    } finally {
      lock.release();
    }
    await client.logout().catch(() => {});
    return {
      ok: true,
      message: `Successfully connected to Gmail mailbox (${cleanEmail})`,
    };
  } catch (err: unknown) {
    const formatted = formatImapError(err);
    return {
      ok: false,
      error: formatted.error,
    };
  }
}

/**
 * Fetches the latest 10 messages from INBOX
 */
export async function fetchInboxMessages(
  email: string,
  appPassword: string,
  limit = 10
): Promise<{ ok: boolean; messages?: GmailMessageSummary[]; error?: string }> {
  const { email: cleanEmail, pass: cleanPass } = cleanCredentials(email, appPassword);
  if (!cleanEmail || !cleanPass) {
    return {
      ok: false,
      error: 'Email address and App Password are required.',
    };
  }

  const client = createClient(cleanEmail, cleanPass);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const summaries: GmailMessageSummary[] = [];

    try {
      const mailbox = client.mailbox;
      if (!mailbox || mailbox.exists === 0) {
        return { ok: true, messages: [] };
      }

      const total = mailbox.exists;
      const startSeq = Math.max(1, total - limit + 1);
      const sequenceRange = `${startSeq}:${total}`;

      for await (const msg of client.fetch(sequenceRange, {
        envelope: true,
        bodyStructure: true,
        uid: true,
      })) {
        const fromAddress =
          msg.envelope?.from?.[0]?.address ||
          msg.envelope?.from?.[0]?.name ||
          'Unknown Sender';
        const fromName = msg.envelope?.from?.[0]?.name || fromAddress;
        const subject = msg.envelope?.subject || '(No Subject)';
        const dateStr = msg.envelope?.date
          ? new Date(msg.envelope.date).toISOString()
          : new Date().toISOString();

        summaries.push({
          id: String(msg.uid),
          seq: msg.seq,
          subject,
          from: fromAddress,
          fromName,
          date: dateStr,
          snippet: `From ${fromName}: ${subject}`,
        });
      }
    } finally {
      lock.release();
    }

    await client.logout().catch(() => {});
    // Sort descending by sequence/date (newest first)
    summaries.sort((a, b) => b.seq - a.seq);

    return {
      ok: true,
      messages: summaries,
    };
  } catch (err: unknown) {
    const formatted = formatImapError(err);
    return {
      ok: false,
      error: formatted.error,
    };
  }
}

/**
 * Fetches full message content by UID
 */
export async function fetchFullMessage(
  email: string,
  appPassword: string,
  uid: string
): Promise<{ ok: boolean; message?: GmailFullMessage; error?: string }> {
  const { email: cleanEmail, pass: cleanPass } = cleanCredentials(email, appPassword);
  if (!cleanEmail || !cleanPass || !uid) {
    return {
      ok: false,
      error: 'Email, App Password, and Message UID are required.',
    };
  }

  const client = createClient(cleanEmail, cleanPass);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let messageObj: GmailFullMessage | null = null;

    try {
      const downloadResult = await client.download(String(uid), undefined, { uid: true });
      if (downloadResult && downloadResult.content) {
        const parsed = await simpleParser(downloadResult.content);
        const htmlString = typeof parsed.html === 'string' ? parsed.html : '';
        const textContent =
          parsed.text ||
          htmlString.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ||
          '(No text body)';

        messageObj = {
          id: String(uid),
          subject: parsed.subject || '(No Subject)',
          from: parsed.from?.text || parsed.from?.value?.[0]?.address || 'Unknown Sender',
          to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(', ') : parsed.to.text) : undefined,
          date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
          text: textContent,
          html: typeof parsed.html === 'string' ? parsed.html : undefined,
        };
      }
    } finally {
      lock.release();
    }

    await client.logout().catch(() => {});

    if (!messageObj) {
      return { ok: false, error: 'Message not found in INBOX.' };
    }

    return { ok: true, message: messageObj };
  } catch (err: unknown) {
    const formatted = formatImapError(err);
    return {
      ok: false,
      error: formatted.error,
    };
  }
}
