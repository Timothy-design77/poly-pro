import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavStore } from '../../store/nav-store';

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
  initialPage = 1,
  settingsContent,
}: SwipeNavigationProps) {
  const settingsIndex = pages.length;
  const destinationLabels = [...pageLabels, 'Settings'];
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [navDragX, setNavDragX] = useState(0);

  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    direction: 'h' | 'v' | null;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const targetPage = useNavStore((s) => s.targetPage);
  const clearTarget = useNavStore((s) => s.clearTarget);

  useEffect(() => {
    if (targetPage === null) return;
    if (targetPage >= 0 && targetPage < pages.length) setCurrentPage(targetPage);
    clearTarget();
  }, [targetPage, pages.length, clearTarget]);

  const navigateTo = (index: number) => {
    const clamped = Math.max(0, Math.min(destinationLabels.length - 1, index));
    setCurrentPage(clamped);
    setNavDragX(0);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!event.isPrimary) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      direction: null,
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

    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    pointerRef.current = null;
  };

  const cancelSwipe = (event?: React.PointerEvent<HTMLElement>) => {
    if (event) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    }
    pointerRef.current = null;
    setNavDragX(0);
  };

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col bg-bg-primary">
      <main className="flex-1 min-h-0 overflow-hidden" aria-live="polite">
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
              <div className="px-4 pt-4 pb-2">
                <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
                <p className="text-xs text-text-muted mt-0.5">App, recording, analysis, and data controls</p>
              </div>
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
        aria-label="Primary navigation. Swipe left or right on this bar to change section."
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
        <div className="grid grid-cols-4 gap-1.5 max-w-lg mx-auto">
          {destinationLabels.map((label, index) => {
            const active = index === currentPage;
            return (
              <button
                key={label}
                type="button"
                onClick={() => navigateTo(index)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[50px] rounded-md px-2 py-2 text-xs font-semibold transition-colors duration-75 ${
                  active
                    ? 'bg-accent text-bg-primary'
                    : 'bg-bg-raised text-text-secondary active:bg-accent-dim active:text-text-primary'
                }`}
                style={active && navDragX !== 0
                  ? { transform: `translateX(${navDragX / 12}px)` }
                  : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
