import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-xl text-xs backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200 ${
        toast.type === 'error'
          ? 'bg-red-950/90 border-red-800 text-red-200'
          : toast.type === 'success'
          ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
          : 'bg-neutral-900/90 border-neutral-800 text-neutral-200'
      }`}
    >
      <div className="flex items-center gap-2">
        {toast.type === 'error' ? (
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        )}
        <span className="font-medium">{toast.message}</span>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="p-1 hover:bg-white/10 rounded transition-colors ml-2 shrink-0"
      >
        <X className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
      </button>
    </div>
  );
};
