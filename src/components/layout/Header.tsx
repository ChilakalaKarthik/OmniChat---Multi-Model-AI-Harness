import React from 'react';
import { Sparkles, Globe, ChevronDown, Sun, Moon } from 'lucide-react';
import { ProviderId, ModelAvailabilityMap } from '../../types';
import { AVAILABLE_MODELS, PROVIDERS } from '../../constants/models';

interface HeaderProps {
  currentProvider: ProviderId | null;
  currentModelId: string | null;
  onSelectModel: (provider: ProviderId, modelId: string) => void;
  hasKeyForCurrentProvider: boolean;
  hasTavilyKey?: boolean;
  keyTestFailed?: boolean;
  modelAvailability: ModelAvailabilityMap;
  onOpenKeysModal: (initialTab?: string) => void;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProvider,
  currentModelId,
  onSelectModel,
  hasTavilyKey,
  keyTestFailed,
  modelAvailability,
  onOpenKeysModal,
  webSearchEnabled,
  onToggleWebSearch,
  theme,
  onToggleTheme,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const providerMeta = currentProvider ? PROVIDERS[currentProvider] : null;
  const modelMeta = currentModelId ? AVAILABLE_MODELS.find((m) => m.id === currentModelId) : null;
  const currentModelUnavailable = currentModelId ? modelAvailability[currentModelId] === false : false;

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-md px-4 flex items-center justify-between z-20 shrink-0">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <a href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-200 group-hover:border-neutral-700 transition-colors">
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-base font-semibold tracking-tight text-neutral-100">
            OmniChat
          </span>
        </a>
      </div>

      {/* Zone 2: Navigation & Model Switcher */}
      <div className="flex items-center gap-2">
        {/* Model Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setModelDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-neutral-900 hover:bg-neutral-850 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 cursor-pointer ${
              currentModelUnavailable
                ? 'border border-red-500/80 text-red-200'
                : keyTestFailed
                ? 'border border-amber-500/80 text-amber-200'
                : 'border border-neutral-800 text-neutral-200'
            }`}
          >
            {currentModelUnavailable ? (
              <span
                className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"
                title="Selected model is unavailable on this account"
              />
            ) : keyTestFailed ? (
              <span
                className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"
                title="API key verification failed"
              />
            ) : providerMeta ? (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: providerMeta.accentColor }}
              />
            ) : (
              <span className="w-2 h-2 rounded-full bg-neutral-500 shrink-0" />
            )}
            {providerMeta ? (
              <>
                <span className="text-neutral-400 font-mono hidden md:inline">
                  {providerMeta.shortName}
                </span>
                <span className="text-neutral-200 font-medium">
                  {modelMeta?.name || currentModelId}
                </span>
              </>
            ) : (
              <span className="text-neutral-400 font-medium">Select Model</span>
            )}

            {/* Warning tag on closed button if unavailable */}
            {currentModelUnavailable && (
              <span className="px-1.5 py-0.2 rounded bg-red-950 border border-red-800 text-red-400 font-mono text-[10px] font-semibold">
                unavailable
              </span>
            )}

            <ChevronDown className="w-3.5 h-3.5 text-neutral-500 ml-0.5" />
          </button>

          {modelDropdownOpen && (
            <div className="absolute top-full mt-1.5 left-0 w-84 max-h-[80vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2 z-50">
              <div className="px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider text-neutral-500 border-b border-neutral-800/80 mb-1 flex items-center justify-between">
                <span>Select Model & Provider</span>
                <button
                  type="button"
                  onClick={() => {
                    setModelDropdownOpen(false);
                    onOpenKeysModal();
                  }}
                  className="text-purple-400 hover:text-purple-300 lowercase text-[10px] hover:underline"
                >
                  verify models
                </button>
              </div>

              {(['openai', 'anthropic', 'gemini', 'xai'] as ProviderId[]).map((pId) => {
                const p = PROVIDERS[pId];
                const models = AVAILABLE_MODELS.filter((m) => m.provider === pId);

                return (
                  <div key={pId} className="mb-2 last:mb-0">
                    <div className="px-2 py-1 text-xs font-semibold text-neutral-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: p.accentColor }}
                        />
                        {p.name}
                      </span>
                    </div>

                    <div className="space-y-0.5 mt-0.5">
                      {models.map((m) => {
                        const isSelected = m.id === currentModelId;
                        const isUnavailable = modelAvailability[m.id] === false;
                        const isAvailable = modelAvailability[m.id] === true;

                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              onSelectModel(pId, m.id);
                              setModelDropdownOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                              isSelected
                                ? 'bg-neutral-800 text-neutral-100 font-medium'
                                : 'text-neutral-300 hover:bg-neutral-850 hover:text-neutral-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-medium truncate">{m.name}</span>
                                {isUnavailable && (
                                  <span className="px-1.5 py-0.2 rounded bg-red-950/90 border border-red-800 text-red-400 font-mono text-[10px] font-semibold shrink-0">
                                    unavailable
                                  </span>
                                )}
                                {isAvailable && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-mono text-[10px] shrink-0">
                                    available
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                                {m.contextWindow}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-neutral-400">
                              <span className="line-clamp-1">{m.description}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Web Search Grounding Quick Toggle */}
        {(() => {
          const isTavilyRequiredAndMissing = currentProvider !== 'gemini' && !hasTavilyKey;
          const searchTitle = isTavilyRequiredAndMissing
            ? 'Add a Tavily key to enable web search'
            : webSearchEnabled
            ? currentProvider === 'gemini'
              ? 'Web search active via Gemini Google Search grounding'
              : 'Web search active via Tavily Search'
            : 'Enable web search grounding';

          return (
            <button
              type="button"
              onClick={() => {
                if (isTavilyRequiredAndMissing) {
                  onOpenKeysModal('tavily');
                } else {
                  onToggleWebSearch();
                }
              }}
              title={searchTitle}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                webSearchEnabled
                  ? 'bg-blue-950/40 border-blue-800/80 text-blue-300'
                  : isTavilyRequiredAndMissing
                  ? 'bg-neutral-900/50 border-neutral-850 text-neutral-500 hover:text-neutral-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Web Search</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  webSearchEnabled ? 'bg-blue-400 animate-pulse' : 'bg-neutral-600'
                }`}
              />
            </button>
          );
        })()}

        {/* API Key Modal Button */}
        <button
          type="button"
          onClick={() => onOpenKeysModal()}
          title="Open API Key Manager"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:text-neutral-100 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Keys</span>
        </button>
      </div>

      {/* Zone 3: Dark / Light Mode Toggle Button */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-neutral-100 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Dark</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
