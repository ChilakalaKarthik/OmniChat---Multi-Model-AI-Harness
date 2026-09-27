import React from 'react';
import { X, FileText, Mail, ShieldAlert, Cpu, Sparkles, CheckCircle2 } from 'lucide-react';

interface ToolPreviewModalProps {
  tool: 'rag' | 'gmail' | null;
  onClose: () => void;
}

export const ToolPreviewModal: React.FC<ToolPreviewModalProps> = ({ tool, onClose }) => {
  if (!tool) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            {tool === 'rag' ? (
              <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
                <FileText className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-rose-400">
                <Mail className="w-4 h-4" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">
                {tool === 'rag' ? 'Document Grounding (RAG)' : 'Gmail Assistant Integration'}
              </h3>
              <p className="text-xs text-neutral-400 font-mono">
                {tool === 'rag' ? 'Scheduled for Phase 3' : 'Scheduled for Phase 5'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {tool === 'rag' ? (
          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
            <p>
              In <strong>Phase 3</strong>, you will be able to upload PDF, DOCX, or TXT files up to 15MB.
            </p>
            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
              <div className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero-Cost Naive RAG Architecture:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-neutral-400 font-mono text-[11px]">
                <li>File parsed on server using pdf-parse & mammoth</li>
                <li>Split into ~1,500 character chunks held in-memory</li>
                <li>Top 6 keyword-overlapping chunks injected into prompt</li>
                <li>Zero external vector database or embedding costs</li>
              </ul>
            </div>
            <p className="text-[11px] text-neutral-500">
              Per spec guidelines, this tool is prepared in the UI shell and will be implemented in Phase 3.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
            <p>
              In <strong>Phase 5</strong>, you will be able to connect your Gmail account via Google OAuth 2.0 to browse recent emails and generate smart draft replies.
            </p>
            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
              <div className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Safety & OAuth Architecture:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-neutral-400 font-mono text-[11px]">
                <li>Server-side OAuth code exchange (never client secrets in browser)</li>
                <li>In-memory session token storage only</li>
                <li>Never auto-sends email — drafts only for human review</li>
                <li>Messages preview drawer with 1-click draft prompt</li>
              </ul>
            </div>
            <p className="text-[11px] text-neutral-500">
              Per spec guidelines, this tool is prepared in the UI shell and will be implemented in Phase 5.
            </p>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
