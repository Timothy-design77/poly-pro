import { useEffect, useRef, type RefObject } from 'react';
const inertLocks = new Map<HTMLElement, { count: number; original: boolean }>();
const focusable = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
export function useDialogFocus(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Keep background controls out of keyboard and accessibility navigation.
    // Walking ancestors also isolates nested confirmations inside a dialog.
    const inerted: HTMLElement[] = [];
    let branch: HTMLElement | null = ref.current;
    while (branch && branch !== document.body) {
      for (const sibling of Array.from(branch.parentElement?.children ?? [])) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          const lock = inertLocks.get(sibling) ?? { count: 0, original: sibling.inert };
          lock.count++; inertLocks.set(sibling, lock); inerted.push(sibling); sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    const frame = requestAnimationFrame(() => ref.current?.focus());
    const handler = (event: KeyboardEvent) => {
      const dialog = ref.current; if (!dialog) return;
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter((element) => element.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', handler); for (const element of inerted) {
      const lock = inertLocks.get(element);
      if (lock && --lock.count === 0) { element.inert = lock.original; inertLocks.delete(element); }
    } if (previous?.isConnected) previous.focus(); };
  }, [ref, open]);
}
