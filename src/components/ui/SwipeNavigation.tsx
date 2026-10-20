import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavStore } from '../../store/nav-store';
import { PageHeader } from './PageHeader';

interface SwipeNavigationProps {
  pages: ReactNode[];
  pageLabels: string[];
  initialPage?: number;
  settingsContent?: ReactNode;
}

const SWIPE_DISTANCE = 34;
const DIRECTION_LOCK = 12;

/**
 * Persistent bottom navigation.
 *
 * Main content never owns a horizontal swipe gesture. The bottom navigation
 * bar itself does: swipe left/right on the bar to move one destination at a
 * time. Settings is a first-class destination so the bar remains visible and
 * there is no top-corner Done button to reach for.
 *
 * App pages remain mounted while another destination is selected so active
 * playback/recording hooks are never torn down by navigation. Settings mounts
 * only while visible because its control tree is comparatively heavy.
 */
export function SwipeNavigation({
  pages,
  pageLabels,
  initialPage = 0,
  settingsContent,
}: SwipeNavigationProps) {
  const settingsIndex = pages.length;
  const destinationLabels = [...pageLabels, 'Settings'];
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [navDragX, setNavDragX] = useState(0);
  const [capturePhase, setCapturePhase] = useState('idle');
  const captureLockedRef = useRef(false);
  const isRecording = ['recording', 'stopping', 'saving'].includes(capturePhase);

  useEffect(() => {
    const onCapturePhase = (event: Event) => {
      const phase = (event as CustomEvent<{ phase: string }>).detail.phase;
      captureLockedRef.current = ['recording', 'stopping', 'saving'].includes(phase);
      setCapturePhase(phase);
      if (captureLockedRef.current) setCurrentPage(initialPage);
    };
    window.addEventListener('polypro:recording-phase', onCapturePhase);
    return () => window.removeEventListener('polypro:recording-phase', onCapturePhase);
  }, [initialPage]);

  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    direction: 'h' | 'v' | null;
    captured: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const targetPage = useNavStore((s) => s.targetPage);
  const clearTarget = useNavStore((s) => s.clearTarget);

  useEffect(() => {
    if (targetPage === null) return;
    if (!captureLockedRef.current && targetPage >= 0 && targetPage < pages.length) {
      if (targetPage !== currentPage) window.dispatchEvent(new Event('polypro:navigation'));
      setCurrentPage(targetPage);
    }
    clearTarget();
  }, [targetPage, pages.length, clearTarget, isRecording, currentPage]);

  useEffect(() => { window.dispatchEvent(new Event('polypro:navigation')); }, [currentPage]);

  const navigateTo = (index: number) => {
    if (captureLockedRef.current) return;
    const clamped = Math.max(0, Math.min(destinationLabels.length - 1, index));
    if (clamped !== currentPage) window.dispatchEvent(new Event('polypro:navigation'));
    setCurrentPage(clamped);
    setNavDragX(0);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!event.isPrimary) return;
    // Do not capture an ordinary tap. Capturing on pointer-down retargets the
    // eventual click to <nav> in Chromium and prevents the button onClick from
    // firing. Capture only after a real horizontal drag is established.
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      direction: null,
      captured: false,
    };
    setNavDragX(0);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;

    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;

    if (pointer.direction === null) {
      if (Math.hypot(dx, dy) < DIRECTION_LOCK) return;
      pointer.direction = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
      if (pointer.direction === 'h') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.captured = true;
        } catch {}
      }
    }

    if (pointer.direction === 'h') {
      setNavDragX(Math.max(-56, Math.min(56, dx)));
    }
  };

  const finishSwipe = (event: React.PointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;

    const dx = event.clientX - pointer.startX;
    const didSwipe = pointer.direction === 'h' && Math.abs(dx) >= SWIPE_DISTANCE;

    if (didSwipe) {
      suppressClickRef.current = true;
      navigateTo(currentPage + (dx < 0 ? 1 : -1));
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    } else {
      setNavDragX(0);
    }

    if (pointer.captured) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    }
    pointerRef.current = null;
  };

  const cancelSwipe = (event?: React.PointerEvent<HTMLElement>) => {
    const pointer = pointerRef.current;
    if (event && pointer?.captured) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    }
    pointerRef.current = null;
    setNavDragX(0);
  };

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col bg-bg-primary">
      <main className="flex-1 min-h-0 overflow-hidden">
        {pages.map((page, index) => (
          <section
            key={pageLabels[index] ?? index}
            className={index === currentPage ? 'h-full' : 'hidden'}
            aria-hidden={index !== currentPage}
          >
            {page}
          </section>
        ))}

        {currentPage === settingsIndex && (
          <section className="h-full overflow-y-auto overscroll-contain bg-bg-primary" aria-label="Settings">
            <div className="w-full max-w-xl mx-auto pb-8">
              <div className="px-4"><PageHeader title="Settings" /></div>
              {settingsContent || (
                <div className="flex items-center justify-center h-40 text-text-muted text-sm">
                  No settings available
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <nav
        className="shrink-0 border-t border-border-subtle bg-bg-surface px-2 pt-2 pb-safe select-none"
        aria-label="Primary navigation"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {isRecording && <p role="status" className="pb-2 text-center text-xs font-semibold text-danger">{capturePhase === 'recording' ? 'Recording in progress' : 'Saving your take…'}</p>}
        <div className="grid grid-cols-4 gap-1.5 max-w-lg mx-auto">
          {destinationLabels.map((label, index) => {
            const active = index === currentPage;
            return (
              <button
                key={label}
                type="button"
                onClick={() => navigateTo(index)}
                disabled={isRecording && !active}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[52px] flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-xs font-semibold disabled:opacity-40 ${
                  active
                    ? 'bg-accent-dim text-text-primary'
                    : 'text-text-muted active:bg-bg-raised'
                }`}
                style={active && navDragX !== 0
                  ? { transform: `translateX(${navDragX / 12}px)` }
                  : undefined}
              >
                <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {index === 0 ? <><path d="M8 3h8l4 18H4L8 3Z"/><path d="m12 16 5-10M9 17h6"/></> : index === 1 ? <><path d="M4 8v8m4-12v16m4-13v10m4-14v18m4-13v8"/></> : index === 2 ? <><path d="M3 7V5h6l2 2h10v13H3V7Z"/><path d="M8 12h8m-8 4h5"/></> : <><circle cx="12" cy="12" r="3"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z"/></>}
                </svg>
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
