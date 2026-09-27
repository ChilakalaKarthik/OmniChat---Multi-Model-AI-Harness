import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Send,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  MessageSquare,
  LogOut,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import {
  getStoredGmailCredentials,
  saveStoredGmailCredentials,
  clearStoredGmailCredentials,
  StoredGmailCredentials,
} from '../../utils/storage';
import { ProviderId, ApiKeys } from '../../types';

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

interface GmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProvider: ProviderId;
  currentModelId: string;
  keys: ApiKeys;
  onInsertToChat?: (text: string) => void;
  onToast: (type: 'error' | 'success' | 'info', message: string) => void;
}

export const GmailModal: React.FC<GmailModalProps> = ({
  isOpen,
  onClose,
  currentProvider,
  currentModelId,
  keys,
  onInsertToChat,
  onToast,
}) => {
  const [credentials, setCredentials] = useState<StoredGmailCredentials | null>(
    getStoredGmailCredentials
  );
  const [emailInput, setEmailInput] = useState('');
  const [appPasswordInput, setAppPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [fullMessage, setFullMessage] = useState<GmailFullMessage | null>(null);
  const [isLoadingFullMessage, setIsLoadingFullMessage] = useState(false);

  const [draftInstructions, setDraftInstructions] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync stored credentials
  useEffect(() => {
    const creds = getStoredGmailCredentials();
    setCredentials(creds);
    if (creds) {
      setEmailInput(creds.email);
      setAppPasswordInput(creds.appPassword);
    }
  }, [isOpen]);

  // Load messages when modal is open and credentials exist
  const loadMessages = useCallback(
    async (creds: StoredGmailCredentials) => {
      setIsLoadingMessages(true);
      setFetchError(null);
      try {
        const res = await fetch('/api/gmail/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: creds.email,
            appPassword: creds.appPassword,
            limit: 10,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          const errMsg = data.error || 'Failed to fetch messages';
          setFetchError(errMsg);
          if (data.error?.includes('Authentication failed')) {
            clearStoredGmailCredentials();
            setCredentials(null);
          }
        } else {
          setMessages(data.messages || []);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Network error fetching messages';
        setFetchError(errMsg);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isOpen && credentials) {
      loadMessages(credentials);
    }
  }, [isOpen, credentials, loadMessages]);

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim();
    const cleanPass = appPasswordInput.replace(/\s+/g, '').trim();

    if (!cleanEmail || !cleanPass) {
      setConnectionError('Please enter both your Gmail address and 16-character App Password.');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const res = await fetch('/api/gmail/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          appPassword: cleanPass,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        const errMsg = data.error || 'Authentication failed — check your email and app password.';
        setConnectionError(errMsg);
        onToast('error', errMsg);
      } else {
        const newCreds: StoredGmailCredentials = {
          email: cleanEmail,
          appPassword: cleanPass,
        };
        saveStoredGmailCredentials(newCreds);
        setCredentials(newCreds);
        onToast('success', `Connected to Gmail (${cleanEmail})`);
        loadMessages(newCreds);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Couldn't reach Gmail — try again in a moment";
      setConnectionError(errMsg);
      onToast('error', errMsg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    clearStoredGmailCredentials();
    setCredentials(null);
    setMessages([]);
    setSelectedMessageId(null);
    setFullMessage(null);
    setGeneratedDraft(null);
    setConnectionError(null);
    onToast('info', 'Disconnected from Gmail');
  };

  const handleSelectMessage = async (msgSummary: GmailMessageSummary) => {
    if (!credentials) return;
    setSelectedMessageId(msgSummary.id);
    setIsLoadingFullMessage(true);
    setFullMessage(null);
    setGeneratedDraft(null);
    setDraftInstructions('');

    try {
      const res = await fetch('/api/gmail/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          appPassword: credentials.appPassword,
          messageId: msgSummary.id,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok && data.message) {
        setFullMessage(data.message);
      } else {
        onToast('error', data.error || 'Failed to load full message content');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading message body';
      onToast('error', msg);
    } finally {
      setIsLoadingFullMessage(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!credentials || !selectedMessageId) return;

    setIsDrafting(true);
    setGeneratedDraft(null);

    const activeApiKey = keys[currentProvider] || '';

    try {
      const res = await fetch('/api/gmail/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          appPassword: credentials.appPassword,
          messageId: selectedMessageId,
          promptInstructions: draftInstructions.trim() || undefined,
          provider: currentProvider,
          model: currentModelId,
          apiKey: activeApiKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok && data.draft) {
        setGeneratedDraft(data.draft);
        onToast('success', 'Draft reply generated');
      } else {
        const errMsg = data.error || 'Failed to generate draft reply';
        onToast('error', errMsg);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Draft generation error';
      onToast('error', errMsg);
    } finally {
      setIsDrafting(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!generatedDraft) return;
    try {
      await navigator.clipboard.writeText(generatedDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onToast('success', 'Draft copied to clipboard');
    } catch {
      onToast('error', 'Failed to copy draft to clipboard');
    }
  };

  const handleSendToChat = () => {
    if (!fullMessage || !onInsertToChat) return;
    const promptText = `Please review this email and help me refine the reply:\n\n--- Email From: ${fullMessage.from} ---\nSubject: ${fullMessage.subject}\nDate: ${fullMessage.date}\n\n${fullMessage.text.slice(0, 1500)}\n\n${generatedDraft ? `[Current Generated Draft]:\n${generatedDraft}\n\n` : ''}`;
    onInsertToChat(promptText);
    onClose();
    onToast('success', 'Email context loaded into chat');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">Gmail Assistant</h2>
              <p className="text-xs text-neutral-400">
                Direct IMAP TLS · App Password · Ephemeral sessionStorage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {!credentials ? (
            /* Connection Form */
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-neutral-100">Connect Your Gmail Account</h3>
                <p className="text-xs text-neutral-400">
                  Connect securely via Google IMAP without OAuth consent friction or Cloud Console setup.
                </p>
              </div>

              {/* Gmail Address Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-neutral-400">Gmail Address</label>
                <div className="relative flex items-center">
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
                  />
                </div>
              </div>

              {/* App Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-neutral-400">
                    Google App Password (16 characters)
                  </label>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 underline font-mono"
                  >
                    <span>Generate App Password</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={appPasswordInput}
                    onChange={(e) => setAppPasswordInput(e.target.value)}
                    placeholder="abcd efgh ijkl mnop"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 p-1 text-neutral-400 hover:text-neutral-200"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500 font-mono">
                  Requires 2-Step Verification enabled on your Google Account. Make sure you&apos;re using an App Password, not your regular Google password.
                </p>
              </div>

              {/* Connection Error Banner */}
              {connectionError && (
                <div className="p-3 rounded-xl border bg-red-950/40 border-red-800/80 text-red-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Authentication failed</div>
                    <div className="text-[11px] opacity-90">{connectionError}</div>
                  </div>
                </div>
              )}

              {/* Connect Button */}
              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isConnecting || !emailInput.trim() || !appPasswordInput.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Connecting to Gmail…</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Connect Gmail</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : selectedMessageId && fullMessage ? (
            /* Selected Message & AI Draft View */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMessageId(null);
                    setFullMessage(null);
                    setGeneratedDraft(null);
                  }}
                  className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 font-mono transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back to Inbox</span>
                </button>
                <span className="text-[11px] font-mono text-neutral-500">
                  {new Date(fullMessage.date).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* Message Header Card */}
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1.5">
                <h4 className="text-sm font-semibold text-neutral-100">{fullMessage.subject}</h4>
                <div className="text-xs text-neutral-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span>From: <strong className="text-neutral-200">{fullMessage.from}</strong></span>
                </div>
                <div className="pt-2 text-xs text-neutral-300 max-h-36 overflow-y-auto whitespace-pre-wrap font-sans border-t border-neutral-850 mt-2">
                  {fullMessage.text}
                </div>
              </div>

              {/* Draft Generation Section */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-neutral-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                    <span>AI Reply Instructions (Optional)</span>
                  </label>
                  <span className="text-[10px] font-mono text-neutral-500">
                    Drafting via {currentModelId}
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={draftInstructions}
                  onChange={(e) => setDraftInstructions(e.target.value)}
                  placeholder="e.g. Accept the meeting warmly, confirm Thursday at 2 PM EST, and ask for the video call link."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 resize-none font-sans"
                />

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={isDrafting}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
                  >
                    {isDrafting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating Draft…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Draft Reply with AI</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSendToChat}
                    className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 font-mono transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Discuss in Chat</span>
                  </button>
                </div>
              </div>

              {/* Generated Draft Display */}
              {generatedDraft && (
                <div className="space-y-2 p-3.5 rounded-xl bg-neutral-950 border border-rose-900/60 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Generated Reply Draft (Human Review Required)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyDraft}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono transition-colors cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Draft</span>
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={generatedDraft}
                    onChange={(e) => setGeneratedDraft(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-neutral-100 focus:outline-none focus:border-neutral-500 font-sans leading-relaxed resize-y"
                  />
                  <p className="text-[11px] text-neutral-500 font-mono">
                    Note: Never auto-sends. Copy your refined draft directly into your email client.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Connected Inbox Messages List */
            <div className="space-y-4">
              {/* Account Status Header */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-neutral-300 font-medium">Connected to {credentials.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadMessages(credentials)}
                    disabled={isLoadingMessages}
                    className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-850 transition-colors cursor-pointer"
                    title="Refresh Inbox"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMessages ? 'animate-spin text-rose-400' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/30 text-[11px] font-mono transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>

              {/* Messages Title */}
              <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                <span>Recent INBOX Messages (Last {messages.length})</span>
                {isLoadingMessages && <span className="text-rose-400 animate-pulse">Syncing...</span>}
              </div>

              {fetchError && (
                <div className="p-3 rounded-xl border bg-red-950/40 border-red-800 text-red-300 text-xs">
                  {fetchError}
                </div>
              )}

              {/* Message List */}
              <div className="space-y-2">
                {isLoadingMessages && messages.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                    <Loader2 className="w-6 h-6 text-rose-400 animate-spin" />
                    <p className="text-xs text-neutral-400">Fetching messages from Gmail INBOX…</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-neutral-500 font-mono">
                    No messages found in INBOX.
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => handleSelectMessage(msg)}
                      className="p-3 rounded-xl bg-neutral-950 hover:bg-neutral-850/80 border border-neutral-800 hover:border-neutral-700 transition-all cursor-pointer space-y-1 group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-neutral-200 group-hover:text-rose-300 transition-colors line-clamp-1">
                          {msg.fromName}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500 shrink-0 ml-2">
                          {new Date(msg.date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-300 font-medium line-clamp-1">
                        {msg.subject}
                      </div>
                      <div className="text-[11px] text-neutral-500 line-clamp-1 font-mono">
                        {msg.from}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Never persisted to disk · Session storage only · Zero auto-send</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
