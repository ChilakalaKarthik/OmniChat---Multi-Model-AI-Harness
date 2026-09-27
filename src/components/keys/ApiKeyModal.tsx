import React, { useState } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2,
  Loader2,
  Sparkles,
  Layers,
  Globe,
  Mail,
  Lock,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { ProviderId, KeyTabId, KeyTestResult, ApiKeys, ModelAvailabilityMap } from '../../types';
import { PROVIDERS, AVAILABLE_MODELS, TAVILY_META, GMAIL_META, ProviderMeta } from '../../constants/models';
import {
  getStoredGmailCredentials,
  saveStoredGmailCredentials,
  clearStoredGmailCredentials,
  StoredGmailCredentials,
} from '../../utils/storage';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  keys: ApiKeys;
  onSaveKey: (provider: KeyTabId, value: string) => void;
  onRemoveKey: (provider: KeyTabId) => void;
  onClearAll: () => void;
  onTestKey: (provider: KeyTabId, customKey?: string) => Promise<KeyTestResult>;
  onVerifyModels: (
    provider?: ProviderId,
    customKey?: string
  ) => Promise<{
    ok: boolean;
    message: string;
    unavailableModels: string[];
    availableModels: string[];
  }>;
  testResults: Record<string, KeyTestResult | null>;
  testingProvider: KeyTabId | null;
  modelAvailability: ModelAvailabilityMap;
  verifyingProvider: ProviderId | 'all' | null;
  initialProvider?: KeyTabId;
  onOpenGmailAssistant?: () => void;
}

const ALL_TABS: {
  id: KeyTabId;
  meta: ProviderMeta | typeof TAVILY_META | typeof GMAIL_META;
  isModelProvider: boolean;
  isGmail?: boolean;
}[] = [
  { id: 'openai', meta: PROVIDERS.openai, isModelProvider: true },
  { id: 'anthropic', meta: PROVIDERS.anthropic, isModelProvider: true },
  { id: 'gemini', meta: PROVIDERS.gemini, isModelProvider: true },
  { id: 'xai', meta: PROVIDERS.xai, isModelProvider: true },
  { id: 'tavily', meta: TAVILY_META, isModelProvider: false },
  { id: 'gmail', meta: GMAIL_META, isModelProvider: false, isGmail: true },
];

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  keys,
  onSaveKey,
  onRemoveKey,
  onClearAll,
  onTestKey,
  onVerifyModels,
  testResults,
  testingProvider,
  modelAvailability,
  verifyingProvider,
  initialProvider = 'gemini',
  onOpenGmailAssistant,
}) => {
  const [activeTab, setActiveTab] = useState<KeyTabId>(initialProvider);
  const [draftKeys, setDraftKeys] = useState<Record<KeyTabId, string>>({
    openai: keys.openai || '',
    anthropic: keys.anthropic || '',
    gemini: keys.gemini || '',
    xai: keys.xai || '',
    tavily: keys.tavily || '',
    gmail: '',
  });
  const [showKeys, setShowKeys] = useState<Record<KeyTabId, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
    xai: false,
    tavily: false,
    gmail: false,
  });

  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  // Gmail-specific state
  const [gmailCreds, setGmailCreds] = useState<StoredGmailCredentials | null>(
    getStoredGmailCredentials
  );
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailPassword, setGmailPassword] = useState('');
  const [showGmailPassword, setShowGmailPassword] = useState(false);
  const [isGmailConnecting, setIsGmailConnecting] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailSuccessMsg, setGmailSuccessMsg] = useState<string | null>(null);

  // Sync draft keys and gmail credentials when modal opens
  React.useEffect(() => {
    setDraftKeys({
      openai: keys.openai || '',
      anthropic: keys.anthropic || '',
      gemini: keys.gemini || '',
      xai: keys.xai || '',
      tavily: keys.tavily || '',
      gmail: '',
    });
    setVerifyNotice(null);
    const creds = getStoredGmailCredentials();
    setGmailCreds(creds);
    if (creds) {
      setGmailEmail(creds.email);
      setGmailPassword(creds.appPassword);
    }
  }, [keys, isOpen]);

  if (!isOpen) return null;

  const currentTabObj = ALL_TABS.find((t) => t.id === activeTab) || ALL_TABS[0];
  const currentMeta = currentTabObj.meta;
  const isModelProvider = currentTabObj.isModelProvider;
  const isGmailTab = currentTabObj.isGmail === true;
  const currentDraftValue = draftKeys[activeTab] || '';
  const currentStoredValue = keys[activeTab] || '';
  const isDirty = currentDraftValue !== currentStoredValue;
  const currentTestResult = testResults[activeTab];
  const isTesting = testingProvider === activeTab;
  const isVerifying =
    isModelProvider &&
    (verifyingProvider === activeTab || verifyingProvider === 'all');

  const providerModels = isModelProvider
    ? AVAILABLE_MODELS.filter((m) => m.provider === activeTab)
    : [];

  const handleSaveActive = () => {
    onSaveKey(activeTab, draftKeys[activeTab] || '');
  };

  const handleClearActive = () => {
    setDraftKeys((prev) => ({ ...prev, [activeTab]: '' }));
    onRemoveKey(activeTab);
  };

  const toggleShow = (pId: KeyTabId) => {
    setShowKeys((prev) => ({ ...prev, [pId]: !prev[pId] }));
  };

  const handleVerifyActive = async () => {
    if (!isModelProvider) return;
    setVerifyNotice(null);
    const res = await onVerifyModels(activeTab as ProviderId, draftKeys[activeTab]);
    setVerifyNotice(res.message);
  };

  const handleVerifyAll = async () => {
    setVerifyNotice(null);
    const res = await onVerifyModels();
    setVerifyNotice(res.message);
  };

  // Gmail connection handler
  const handleConnectGmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = gmailEmail.trim();
    const cleanPass = gmailPassword.replace(/\s+/g, '').trim();

    if (!cleanEmail || !cleanPass) {
      setGmailError('Please provide both your Gmail address and 16-character App Password.');
      return;
    }

    setIsGmailConnecting(true);
    setGmailError(null);
    setGmailSuccessMsg(null);

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
        setGmailError(data.error || 'Authentication failed — check email and app password.');
      } else {
        const newCreds: StoredGmailCredentials = {
          email: cleanEmail,
          appPassword: cleanPass,
        };
        saveStoredGmailCredentials(newCreds);
        setGmailCreds(newCreds);
        setGmailSuccessMsg(`Connected successfully to ${cleanEmail}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't reach Gmail — try again in a moment";
      setGmailError(msg);
    } finally {
      setIsGmailConnecting(false);
    }
  };

  const handleDisconnectGmail = () => {
    clearStoredGmailCredentials();
    setGmailCreds(null);
    setGmailEmail('');
    setGmailPassword('');
    setGmailError(null);
    setGmailSuccessMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-300">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">API Key & Service Manager</h2>
              <p className="text-xs text-neutral-400">Bring Your Own Key · Stored in sessionStorage only</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider & Service Tabs */}
        <div className="flex items-center px-6 border-b border-neutral-800 bg-neutral-950/40 gap-1 overflow-x-auto shrink-0">
          {ALL_TABS.map((t) => {
            const pId = t.id;
            const p = t.meta;
            const hasKeyValue = pId === 'gmail' ? Boolean(gmailCreds) : Boolean(keys[pId]);
            const isActive = activeTab === pId;
            const testRes = testResults[pId];
            const hasFailed = testRes && !testRes.ok;

            return (
              <button
                key={pId}
                type="button"
                onClick={() => {
                  setActiveTab(pId);
                  setVerifyNotice(null);
                  setGmailError(null);
                  setGmailSuccessMsg(null);
                }}
                className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-neutral-200 text-neutral-100'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: p.accentColor }}
                />
                <span>{p.name}</span>
                {hasFailed ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Validation failed" />
                ) : hasKeyValue ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Connected / configured" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {isGmailTab ? (
            /* Gmail Assistant Tab Body */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <span>{currentMeta.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800/80 text-rose-300">
                      IMAP TLS
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">{currentMeta.tagline}</p>
                </div>
                <a
                  href={currentMeta.keyHelpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 underline font-mono"
                >
                  <span>Generate App Password</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Status or Form */}
              {gmailCreds ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-neutral-950 border border-emerald-800/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Connected to Gmail</span>
                        </div>
                        <div className="text-xs text-neutral-300 font-mono mt-0.5">
                          {gmailCreds.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {onOpenGmailAssistant && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenGmailAssistant();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                        >
                          <span>Open Assistant</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDisconnectGmail}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-red-400 hover:bg-red-950/20 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3 h-3" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-850 space-y-2 text-xs text-neutral-300">
                    <div className="font-semibold text-neutral-200">Session Security Guarantee</div>
                    <ul className="list-disc pl-4 space-y-1 text-neutral-400 font-mono text-[11px]">
                      <li>Credentials stored exclusively in this browser tab&apos;s sessionStorage</li>
                      <li>Encrypted TLS connection directly to Google IMAP (<code className="text-neutral-300">imap.gmail.com:993</code>)</li>
                      <li>Zero auto-send capabilities — AI produces human-reviewed draft replies only</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleConnectGmail} className="space-y-4">
                  {/* Gmail Address */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-neutral-400">Gmail Address</label>
                    <input
                      type="email"
                      required
                      value={gmailEmail}
                      onChange={(e) => setGmailEmail(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
                    />
                  </div>

                  {/* App Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-neutral-400">
                        16-character Google App Password
                      </label>
                      <span className="text-[11px] text-neutral-500 font-mono">
                        Requires Google 2-Step Verification
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type={showGmailPassword ? 'text' : 'password'}
                        required
                        value={gmailPassword}
                        onChange={(e) => setGmailPassword(e.target.value)}
                        placeholder="abcd efgh ijkl mnop"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGmailPassword((p) => !p)}
                        className="absolute right-3 p-1 text-neutral-400 hover:text-neutral-200"
                        title={showGmailPassword ? 'Hide password' : 'Show password'}
                      >
                        {showGmailPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Error & Success Messages */}
                  {gmailError && (
                    <div className="p-3 rounded-xl border bg-red-950/40 border-red-800/80 text-red-300 text-xs flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Authentication failed</div>
                        <div className="text-[11px] opacity-90">{gmailError}</div>
                      </div>
                    </div>
                  )}

                  {gmailSuccessMsg && (
                    <div className="p-3 rounded-xl border bg-emerald-950/40 border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{gmailSuccessMsg}</span>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={isGmailConnecting || !gmailEmail.trim() || !gmailPassword.trim()}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
                    >
                      {isGmailConnecting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Connecting to Gmail...</span>
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
              )}
            </div>
          ) : (
            /* LLM & Tavily Key Tab Body */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-100">{currentMeta.name}</h3>
                  <p className="text-xs text-neutral-400">{currentMeta.tagline}</p>
                </div>
                <a
                  href={currentMeta.keyHelpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 underline font-mono"
                >
                  <span>Get API key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Key Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-neutral-400">
                  API Key ({currentMeta.shortName})
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showKeys[activeTab] ? 'text' : 'password'}
                    value={currentDraftValue}
                    onChange={(e) =>
                      setDraftKeys((prev) => ({ ...prev, [activeTab]: e.target.value }))
                    }
                    placeholder={currentMeta.placeholder}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 pr-20 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleShow(activeTab)}
                      className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-md transition-colors"
                      title={showKeys[activeTab] ? 'Hide key' : 'Show key'}
                    >
                      {showKeys[activeTab] ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-500 font-mono">
                  Expected prefix: <span className="text-neutral-400">{currentMeta.keyPrefix}</span>
                </p>
              </div>

              {/* Test Status Banner */}
              {currentTestResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    currentTestResult.ok
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                      : 'bg-red-950/40 border-red-800/80 text-red-300'
                  }`}
                >
                  {currentTestResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-semibold">
                      {currentTestResult.ok ? 'Connection Verified' : 'Key Validation Failed'}
                    </div>
                    <div className="text-[11px] opacity-90">
                      {currentTestResult.message || currentTestResult.reason}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Row for Active Tab */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  {/* Test Key Button */}
                  <button
                    type="button"
                    onClick={() => onTestKey(activeTab, draftKeys[activeTab])}
                    disabled={isTesting || !draftKeys[activeTab]?.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-750 disabled:opacity-50 text-neutral-200 transition-colors cursor-pointer"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <span>Test Key</span>
                    )}
                  </button>

                  {/* Verify Models Button for LLM Providers */}
                  {isModelProvider && (
                    <button
                      type="button"
                      onClick={handleVerifyActive}
                      disabled={isVerifying || !draftKeys[activeTab]?.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/80 text-purple-300 disabled:opacity-50 transition-colors cursor-pointer"
                      title={`Call ${currentMeta.name}'s model-list endpoint with your key to check availability`}
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          <span>Verify Models</span>
                        </>
                      )}
                    </button>
                  )}

                  {currentStoredValue && (
                    <button
                      type="button"
                      onClick={handleClearActive}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-red-400 hover:bg-red-950/20 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSaveActive}
                  disabled={!isDirty && Boolean(currentStoredValue)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-white disabled:opacity-50 text-neutral-900 transition-colors cursor-pointer"
                >
                  Save Key
                </button>
              </div>

              {/* Model Status Verification List or Service Info */}
              {isModelProvider ? (
                <div className="mt-4 pt-4 border-t border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-neutral-400" />
                      <span className="text-xs font-semibold text-neutral-200">
                        {currentMeta.name} Models on Account
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-neutral-500">
                      Live endpoint check
                    </span>
                  </div>

                  {verifyNotice && (
                    <div className="px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 font-mono">
                      {verifyNotice}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {providerModels.map((m) => {
                      const status = modelAvailability[m.id];
                      return (
                        <div
                          key={m.id}
                          className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-850 flex items-center justify-between text-xs"
                        >
                          <div className="space-y-0.5 min-w-0 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-neutral-200">{m.name}</span>
                              <code className="text-[11px] text-neutral-500 font-mono bg-neutral-900 px-1.5 py-0.5 rounded">
                                {m.id}
                              </code>
                            </div>
                            <p className="text-[11px] text-neutral-400 line-clamp-1">
                              {m.description}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {status === false ? (
                              <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-800 text-red-400 font-mono text-[11px] font-semibold tracking-wide">
                                unavailable
                              </span>
                            ) : status === true ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-mono text-[11px]">
                                available
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-500 font-mono text-[11px]">
                                unverified
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-4 pt-4 border-t border-neutral-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold text-neutral-200">
                      Tavily Web Search Grounding
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-850 space-y-2 text-xs text-neutral-300">
                    <p>
                      Tavily provides fast, clean web search results optimized for LLM context injection.
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-neutral-400 font-mono text-[11px]">
                      <li>1,000 free search queries every month on Tavily&apos;s free tier</li>
                      <li>Real-time web grounding for OpenAI (GPT), Anthropic (Claude), and xAI (Grok)</li>
                      <li>Google Gemini models use free built-in Google Search grounding automatically</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / Architecture Security Guarantee & Global Verify */}
        <div className="px-6 py-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">
              Ephemeral session storage · Wiped on tab close · Never written to disk
            </span>
            <span className="sm:hidden">Session storage only</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleVerifyAll}
              disabled={isVerifying}
              className="text-[11px] text-purple-400 hover:text-purple-300 font-mono transition-colors disabled:opacity-50 cursor-pointer"
            >
              Verify all connected
            </button>
            <span className="text-neutral-700">·</span>
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-neutral-400 hover:text-red-400 underline font-mono transition-colors cursor-pointer"
            >
              Clear all keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
