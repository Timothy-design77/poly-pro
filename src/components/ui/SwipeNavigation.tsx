import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

interface SwipeNavigationProps {
  pages: ReactNode[];
  pageLabels: string[];
  initialPage?: number;
  settingsContent?: ReactNode;
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;
const SETTINGS_SNAP_FRACTION = 0.25;
const SETTINGS_VELOCITY_THRESHOLD = 0.35;

export function SwipeNavigation({
  pages,
  pageLabels,
  initialPage = 1,
  settingsContent,
}: SwipeNavigationProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsReveal, setSettingsReveal] = useState(0);
  const [settingsDragging, setSettingsDragging] = useState(false);
  const [closeOffset, setCloseOffset] = useState(0);
  const [closeDragging, setCloseDragging] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const directionRef = useRef<'h' | 'v' | null>(null);

  // Settings close refs
  const closeStartXRef = useRef(0);
  const closeStartYRef = useRef(0);
  const closeTimeRef = useRef(0);
  const closeDirRef = useRef<'v' | 'other' | null>(null);

  // ─── Main content touch: horizontal swipe between pages OR vertical swipe to open settings ───

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startXRef.current = t.clientX;
    startYRef.current = t.clientY;
    startTimeRef.current = Date.now();
    directionRef.current = null;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      // Lock direction
      if (directionRef.current === null) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          directionRef.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }
        return;
      }

      if (directionRef.current === 'h') {
        // Rubber-band at edges
        let adj = dx;
        if ((currentPage === 0 && dx > 0) || (currentPage === pages.length - 1 && dx < 0)) {
          adj = dx * 0.2;
        }
        setDragX(adj);
      } else if (directionRef.current === 'v' && dy < -8) {
        // Swiping UP → reveal settings
        const reveal = Math.min(Math.abs(dy), rootRef.current?.clientHeight || 900);
        setSettingsReveal(reveal);
        setSettingsDragging(true);
      }
    },
    [currentPage, pages.length],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);

    if (directionRef.current === 'h') {
      const velocity = Math.abs(dragX) / elapsed;
      let next = currentPage;
      if (Math.abs(dragX) > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        if (dragX > 0 && currentPage > 0) next = currentPage - 1;
        else if (dragX < 0 && currentPage < pages.length - 1) next = currentPage + 1;
      }
      setCurrentPage(next);
      setDragX(0);
    } else if (directionRef.current === 'v' && settingsDragging) {
      const h = rootRef.current?.clientHeight || 900;
      const velocity = settingsReveal / elapsed;
      if (settingsReveal > h * SETTINGS_SNAP_FRACTION || velocity > SETTINGS_VELOCITY_THRESHOLD) {
        setSettingsOpen(true);
      }
      setSettingsReveal(0);
      setSettingsDragging(false);
    }

    directionRef.current = null;
  }, [isDragging, dragX, currentPage, pages.length, settingsDragging, settingsReveal]);

  // ─── Settings panel swipe-down to close ───

  const handleCloseTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    closeStartXRef.current = t.clientX;
    closeStartYRef.current = t.clientY;
    closeTimeRef.current = Date.now();
    closeDirRef.current = null;
    setCloseDragging(true);
  }, []);

  const handleCloseTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!closeDragging) return;
      const t = e.touches[0];
      const dy = t.clientY - closeStartYRef.current;
      const dx = t.clientX - closeStartXRef.current;

      // Lock direction
      if (closeDirRef.current === null) {
        if (Math.abs(dy) > 8 || Math.abs(dx) > 8) {
          closeDirRef.current = Math.abs(dy) > Math.abs(dx) ? 'v' : 'other';
        }
        return;
      }

      if (closeDirRef.current === 'v' && dy > 0) {
        e.preventDefault();
        setCloseOffset(dy);
      }
    },
    [closeDragging],
  );

  const handleCloseTouchEnd = useCallback(() => {
    if (!closeDragging) return;
    setCloseDragging(false);

    const elapsed = Math.max(1, Date.now() - closeTimeRef.current);
    const h = rootRef.current?.clientHeight || 900;
    const velocity = closeOffset / elapsed;

    if (closeOffset > h * SETTINGS_SNAP_FRACTION || velocity > SETTINGS_VELOCITY_THRESHOLD) {
      setSettingsOpen(false);
    }
    setCloseOffset(0);
    closeDirRef.current = null;
  }, [closeDragging, closeOffset]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && settingsOpen) setSettingsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settingsOpen]);

  // ─── Render calculations ───

  const screenH = rootRef.current?.clientHeight || 900;
  const pageWidth = 100 / pages.length; // each page as % of track
  const trackOffset = -(currentPage * pageWidth); // base position in %
  const rootWidth = rootRef.current?.clientWidth || 1;
  const dragPercent = (dragX / rootWidth) * 100; // drag delta as % of root (not track)
  // Convert drag from root % to track %: track is pages.length× wider
  const dragTrackPercent = dragPercent / pages.length;

  // Settings panel Y
  let panelY: number;
  let panelTransition: string;

  if (settingsOpen) {
    panelY = closeDragging ? closeOffset : 0;
    panelTransition = closeDragging ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
  } else if (settingsDragging && settingsReveal > 0) {
    panelY = Math.max(0, screenH - settingsReveal);
    panelTransition = 'none';
  } else {
    panelY = screenH;
    panelTransition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
  }

  const showPanel = settingsOpen || (settingsDragging && settingsReveal > 0);

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden flex flex-col">
      {/* Page indicator pills */}
      <div className="flex items-center justify-center gap-3 py-2 z-10 shrink-0">
        {pageLabels.map((label, i) => (
          <button
            key={label}
            onClick={() => { setCurrentPage(i); setDragX(0); }}
            className={`px-3 py-1 text-xs font-medium rounded-pill transition-all duration-200 min-h-[28px]
              ${i === currentPage
                ? 'text-bg-primary bg-[rgba(255,255,255,0.85)]'
                : 'text-text-muted'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Pages track */}
      <div
        className="flex-1 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full will-change-transform"
          style={{
            width: `${pages.length * 100}%`,
            transform: `translateX(${trackOffset + dragTrackPercent}%)`,
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              className="h-full overflow-y-auto"
              style={{ width: `${pageWidth}%` }}
            >
              {page}
            </div>
          ))}
        </div>
      </div>

      {/* Settings swipe-up handle */}
      {!settingsOpen && !settingsDragging && (
        <div className="shrink-0 flex flex-col items-center pb-2 pt-1">
          <div className="w-10 h-1 rounded-full bg-text-muted mb-1" />
          <span className="text-[10px] text-text-muted tracking-wider uppercase">Settings</span>
        </div>
      )}

      {/* Settings panel */}
      {showPanel && (
        <div
          className="absolute inset-0 z-50 flex flex-col will-change-transform"
          style={{
            transform: `translateY(${panelY}px)`,
            transition: panelTransition,
          }}
        >
          {/* Drag handle zone — swipe down here to close */}
          <div
            className="bg-bg-primary pt-3 pb-2 flex justify-center shrink-0 rounded-t-2xl cursor-grab"
            onTouchStart={handleCloseTouchStart}
            onTouchMove={handleCloseTouchMove}
            onTouchEnd={handleCloseTouchEnd}
          >
            <div className="w-10 h-1 rounded-full bg-text-muted" />
          </div>

          <div className="flex-1 bg-bg-primary flex flex-col min-h-0">
            {/* Header — also draggable to close */}
            <div
              className="flex items-center justify-between px-4 py-2 border-b border-border-subtle shrink-0"
              onTouchStart={handleCloseTouchStart}
              onTouchMove={handleCloseTouchMove}
              onTouchEnd={handleCloseTouchEnd}
            >
              <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-sm font-medium text-[rgba(255,255,255,0.85)] min-w-[44px] min-h-[44px]
                           flex items-center justify-center"
              >
                Done
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {settingsContent || (
                <div className="flex items-center justify-center h-full text-text-muted text-sm">
                  Settings coming in Phase 2
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
