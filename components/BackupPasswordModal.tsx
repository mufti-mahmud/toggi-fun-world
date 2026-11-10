import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';

interface BackupPasswordModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  variant?: 'primary' | 'danger';
  /** Resolves to an error message to show, or null when the action succeeded. */
  onSubmit: (password: string) => Promise<string | null>;
  onClose: () => void;
}

export const BackupPasswordModal: React.FC<BackupPasswordModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  variant = 'primary',
  onSubmit,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPassword('');
    setError(null);
    setBusy(false);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter the backup password.');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onSubmit(password);
    setBusy(false);
    if (result) {
      setError(result);
      inputRef.current?.select();
    }
  };

  const confirmStyle = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-500 shadow-red-900/30'
    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-password-title"
        onSubmit={submit}
        className="bg-gray-850 border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-6 text-gray-100 relative"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-750 transition-colors disabled:opacity-40"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl shrink-0 border ${variant === 'danger' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
            <KeyRound className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 id="backup-password-title" className="text-lg font-bold text-white mb-1.5">{title}</h3>
            <div className="text-sm text-gray-300 leading-relaxed space-y-2">{message}</div>
          </div>
        </div>

        <label htmlFor="backup-password" className="block mt-5 mb-1.5 text-sm font-medium text-gray-300">Backup password</label>
        <input
          id="backup-password"
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="w-full px-3.5 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
        />
        <p role="alert" aria-live="assertive" className="min-h-5 mt-2 text-sm text-red-300">{error}</p>

        <div className="mt-4 flex items-center justify-end gap-3 pt-4 border-t border-gray-750">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-750 hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-60 ${confirmStyle}`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
