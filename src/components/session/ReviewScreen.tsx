import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionAnalysis } from '../../analysis/types';
import { useSessionStore } from '../../store/session-store';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface Props {
  visible: boolean;
  sessionId: string;
  analysis: SessionAnalysis;
  onViewDetails: () => void;
  onRecordAgain: () => void;
  onDelete: () => void;
}

/** The take is already durable. All listening, correction and export use Session Detail. */
export function ReviewScreen({ visible, sessionId, analysis, onViewDetails, onRecordAgain, onDelete }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, visible, onRecordAgain);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!visible) return null;
  const reliable = analysis.totalScored >= 8;
  const remove = async () => {
    setDeleting(true); setError(null);
    try { await useSessionStore.getState().deleteSession(sessionId); onDelete(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not delete this take.'); }
    finally { setDeleting(false); }
  };
  return createPortal(<div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Take saved" tabIndex={-1} data-no-swipe className="fixed inset-0 z-50 bg-bg-primary overflow-y-auto p-5 flex flex-col items-center justify-center outline-none">
    <div className="w-full max-w-md space-y-5">
      <div className="text-center"><p className="text-sm font-semibold text-success">Take saved on this device</p><h1 className="text-3xl font-bold text-text-primary mt-2">{reliable ? `${Math.round(analysis.score)}%` : 'Check your detected hits'}</h1>
        <p className="text-sm text-text-secondary mt-2">{analysis.totalScored} matched / {analysis.totalExpected} expected beats · {analysis.bpm} BPM</p>
        {reliable ? <p className="text-sm text-text-secondary">Timing spread σ {analysis.sigma.toFixed(1)}ms</p> : <p className="text-sm text-warning mt-2">At least 8 matched hits are needed for useful timing feedback.</p>}
      </div>
      {analysis.headlines.slice(0, 3).map((headline, index) => <p key={index} className="rounded-xl bg-bg-surface border border-border-subtle p-3 text-sm text-text-secondary">{headline.text}</p>)}
      <p className="text-xs text-text-muted text-center">Review playback, adjust detected hits, tune scoring, and export audio from your saved take.</p>
      <button className="w-full min-h-[52px] rounded-xl bg-accent text-white font-semibold" onClick={onViewDetails}>Review take</button>
      <button className="w-full min-h-[48px] rounded-xl border border-border-subtle bg-bg-surface text-text-primary font-semibold" onClick={onRecordAgain}>Record another take</button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {confirmDelete ? <div role="alertdialog" aria-label="Delete saved take" className="rounded-xl bg-danger-dim p-3 space-y-3 text-sm text-danger"><p>Delete this take and its recording?</p><div className="flex gap-2"><button className="flex-1 min-h-[44px] bg-bg-surface rounded-lg" onClick={() => setConfirmDelete(false)}>Keep take</button><button disabled={deleting} className="flex-1 min-h-[44px] bg-danger text-white rounded-lg" onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete take'}</button></div></div> : <button className="w-full min-h-[44px] text-sm text-danger" onClick={() => setConfirmDelete(true)}>Delete take</button>}
    </div>
  </div>, document.body);
}
