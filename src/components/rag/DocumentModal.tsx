import React, { useState, useRef } from 'react';
import {
  X,
  FileText,
  UploadCloud,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu,
  Layers,
  FileCode,
} from 'lucide-react';
import { DocumentAttachment } from '../../types';

interface DocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachedDoc?: DocumentAttachment;
  onAttachDocument: (doc: DocumentAttachment, wasReplaced: boolean) => void;
  onRemoveDocument: () => void;
  onErrorToast: (message: string) => void;
  onSuccessToast: (message: string) => void;
}

export const DocumentModal: React.FC<DocumentModalProps> = ({
  isOpen,
  onClose,
  attachedDoc,
  onAttachDocument,
  onRemoveDocument,
  onErrorToast,
  onSuccessToast,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const validateAndUploadFile = async (file: File) => {
    const originalName = file.name;
    const lowerName = originalName.toLowerCase();
    const isSupported =
      lowerName.endsWith('.pdf') ||
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md');

    if (!isSupported) {
      onErrorToast('Only PDF, DOCX, TXT supported');
      return;
    }

    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_SIZE) {
      onErrorToast('File too large — max 15MB');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/document/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        const errorMsg = data.error || 'Failed to upload document';
        onErrorToast(errorMsg);
        return;
      }

      const wasReplaced = Boolean(attachedDoc);
      const newAttachment: DocumentAttachment = {
        id: data.docId,
        filename: data.filename,
        chunkCount: data.chunkCount,
        sizeBytes: data.sizeBytes,
        uploadedAt: Date.now(),
      };

      onAttachDocument(newAttachment, wasReplaced);

      if (wasReplaced) {
        onSuccessToast('Replaced previous document');
      } else {
        onSuccessToast(`Loaded "${data.filename}" (${data.chunkCount} chunks)`);
      }

      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error uploading document';
      onErrorToast(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndUploadFile(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">Document Grounding (RAG)</h2>
              <p className="text-xs text-neutral-400">Attach PDF, DOCX, or TXT · 15MB limit · In-memory</p>
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

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Active Attached Document Card */}
          {attachedDoc && (
            <div className="p-4 rounded-xl bg-neutral-950 border border-emerald-900/60 text-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-neutral-200 truncate">{attachedDoc.filename}</div>
                    <div className="text-[11px] text-neutral-400 font-mono">
                      {formatFileSize(attachedDoc.sizeBytes)} · {attachedDoc.chunkCount} chunks
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onRemoveDocument}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove</span>
                </button>
              </div>

              <div className="pt-2 border-t border-neutral-900 flex items-center gap-2 text-[11px] text-emerald-400 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Active in this session · Top 6 keyword chunks will be injected into chat</span>
              </div>
            </div>
          )}

          {/* Upload Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 ${
              dragActive
                ? 'border-emerald-500 bg-emerald-950/20'
                : 'border-neutral-800 hover:border-neutral-700 bg-neutral-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {isUploading ? (
              <div className="py-4 space-y-2 flex flex-col items-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-xs text-neutral-300 font-medium">
                  Parsing and chunking document (~1,500 chars/chunk)...
                </span>
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300">
                  <UploadCloud className="w-5 h-5 text-neutral-300" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-neutral-200">
                    {attachedDoc ? 'Upload a replacement document' : 'Click to upload or drag & drop'}
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    PDF, DOCX, or TXT (Max 15MB)
                  </p>
                </div>
              </>
            )}
          </div>

          {/* RAG Specs & Architectural Disclosure */}
          <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-850 text-xs space-y-2">
            <div className="font-semibold text-neutral-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Naive Keyword-Overlap RAG Pipeline</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-neutral-400 text-[11px] font-mono leading-relaxed">
              <li>Text parsed server-side via pdf-parse & mammoth</li>
              <li>Split into ~1,500-character chunks held in-memory</li>
              <li>Matches top 6 keyword-overlapping chunks per query</li>
              <li>100% ephemeral: no vector database or external embedding costs</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
          <span>Session-bound: clearing or refreshing clears document</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-750 text-neutral-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
