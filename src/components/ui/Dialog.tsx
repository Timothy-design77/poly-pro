import { useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../hooks/useDialogFocus';

/*
 * Three modal surfaces, all sharing focus isolation (useDialogFocus):
 *  - ScreenDialog: a full-screen tool with a Back header (Review, Calibration…)
 *  - Dialog: a short centered decision
 *  - Sheet: a bottom panel for pickers and forms
 * Layering: screens z-50, dialogs/sheets z-100, help tooltips above both.
 */

function BackIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

interface ScreenDialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  /** Accessible dialog name when the visible title is not plain text. */
  label?: string;
  subtitle?: ReactNode;
  onBack: () => void;
  /** Escape handler; defaults to onBack. */
  onEscape?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  /** Optional trailing header action. */
  action?: ReactNode;
  children: ReactNode;
}

export function ScreenDialog({ title, label, subtitle, onBack, onEscape, backLabel = 'Back', backDisabled = false, action, children, className = '', ...props }: ScreenDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(ref, true, onEscape ?? onBack);
  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} aria-labelledby={label ? undefined : titleId} tabIndex={-1} data-no-swipe className={`screen ${className}`} {...props}>
      <header className="screen-header">
        <div>
          <button type="button" onClick={onBack} disabled={backDisabled} className="ui-button ui-button-quiet -ml-1 pl-2 pr-3 gap-1">
            <BackIcon />{backLabel}
          </button>
        </div>
        <div className="min-w-0">
          <h1 id={titleId} className="screen-title truncate">{title}</h1>
          {subtitle && <p className="screen-subtitle">{subtitle}</p>}
        </div>
        <div>{action}</div>
      </header>
      {children}
    </div>,
    document.body,
  );
}

interface DialogProps {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** Buttons, stacked full width. Put the recommended action first. */
  actions: ReactNode;
  /** Use for confirmations of destructive or irreversible actions. */
  alert?: boolean;
}

export function Dialog({ title, onClose, children, actions, alert = false }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(ref, true, onClose);
  return createPortal(
    <div data-no-swipe className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-5 animate-fade-in" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-full max-w-[360px] rounded-2xl bg-bg-surface p-5 outline-none animate-modal-pop">
        <h2 id={titleId} className="text-base font-semibold text-text-primary">{title}</h2>
        {children && <div className="mt-2 text-sm leading-relaxed text-text-secondary">{children}</div>}
        <div className="mt-5 grid gap-2">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Trailing header control; defaults to a Done button. */
  headerAction?: ReactNode;
  closeLabel?: string;
}

export function Sheet({ title, onClose, children, headerAction, closeLabel = 'Done' }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(ref, true, onClose);
  return createPortal(
    <div data-no-swipe className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 animate-fade-in" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex max-h-[92dvh] w-full max-w-[560px] flex-col rounded-t-2xl bg-bg-surface outline-none animate-slide-up">
        <div className="flex min-h-[56px] shrink-0 items-center justify-between gap-3 border-b border-border-subtle pl-5 pr-2">
          <h2 id={titleId} className="text-base font-semibold text-text-primary">{title}</h2>
          {headerAction ?? <button type="button" onClick={onClose} className="ui-button ui-button-quiet">{closeLabel}</button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
