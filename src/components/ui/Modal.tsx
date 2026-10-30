import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  confirmDanger?: boolean;
  onConfirm?: () => void | Promise<void>;
}

/** Confirmation dialog with async confirm handling and inline failure message. */
export function Modal({ isOpen, onClose, title, children, confirmLabel, confirmDanger = false, onConfirm }: ModalProps) {
  if (!isOpen) return null;
  return <ConfirmDialog onClose={onClose} title={title} confirmLabel={confirmLabel} confirmDanger={confirmDanger} onConfirm={onConfirm}>{children}</ConfirmDialog>;
}

function ConfirmDialog({ onClose, title, children, confirmLabel, confirmDanger, onConfirm }: Omit<ModalProps, 'isOpen'>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!onConfirm) return;
    setBusy(true); setError(null);
    try { await onConfirm(); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not complete the action.'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog
      title={title}
      alert={confirmDanger}
      onClose={() => { if (!busy) onClose(); }}
      actions={<>
        {onConfirm && <Button variant={confirmDanger ? 'danger' : 'primary'} disabled={busy} onClick={() => void confirm()}>{confirmLabel || 'Confirm'}</Button>}
        <Button variant="quiet" disabled={busy} onClick={onClose}>Cancel</Button>
      </>}
    >
      {children}
      {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    </Dialog>
  );
}
