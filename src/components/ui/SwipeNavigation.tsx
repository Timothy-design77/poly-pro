import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

interface SwipeNavigationProps {
  pages: ReactNode[];
  pageLabels: string[];
  initialPage?: number;
  settingsContent?: ReactNode;
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;
const SETTINGS_SNAP_FRACTION = 0.3;
const SETTINGS_VELOCITY_THRESHOLD = 0.4;

export function SwipeNavigation({
  pages,
  pageLabels,
  initialPage = 1,
  settingsContent,
}: SwipeNavigationProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsReveal, setSettingsReveal] = useState(0);
  const [settingsDragging, setSettingsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const directionRef = useRef<'horizontal' | 'vertical' | null>(null);

  // ─── Horizontal page swiping ───

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    directionRef.current = null;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      if (directionRef.current === null) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          directionRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        }
        return;
      }

      if (directionRef.current === 'horizontal') {
        let adjustedDx = dx;
        if (
          (currentPage === 0 && dx > 0) ||
          (currentPage === pages.length - 1 && dx < 0)
        ) {
          adjustedDx = dx * 0.25;
        }
        setTranslateX(adjustedDx);
      } else if (directionRef.current === 'vertical' && dy < -10) {
        // Swiping UP → reveal settings panel following the finger
        setSettingsReveal(Math.abs(dy));
        setSettingsDragging(true);
      }
    },
    [currentPage, pages.length],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const elapsed = Math.max(1, Date.now() - startTimeRef.current);

    if (directionRef.current === 'horizontal') {
      const velocity = Math.abs(translateX) / elapsed;
      let newPage = currentPage;
      if (Math.abs(translateX) > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        if (translateX > 0 && currentPage > 0) newPage = currentPage - 1;
        else if (translateX < 0 && currentPage < pages.length - 1) newPage = currentPage + 1;
      }
      setCurrentPage(newPage);
      setTranslateX(0);
    } else if (directionRef.current === 'vertical' && settingsDragging) {
      const screenH = rootRef.current?.clientHeight || 800;
      const velocity = settingsReveal / elapsed;
      if (settingsReveal > screenH * SETTINGS_SNAP_FRACTION || velocity > SETTINGS_VELOCITY_THRESHOLD) {
        setSettingsOpen(true);
      }
      setSettingsReveal(0);
      setSettingsDragging(false);
    }

    directionRef.current = null;
  }, [isDragging, translateX, currentPage, pages.length, settingsDragging, settingsReveal]);

  // ─── Settings swipe-down to close ───

  const closeStartYRef = useRef(0);
  const closeTimeRef = useRef(0);
  const [closeOffset, setCloseOffset] = useState(0);
  const [closeDragging, setCloseDragging] = useState(false);
  const closeDirRef = useRef<boolean | null>(null); // true = vertical confirmed

  const handleSettingsTouchStart = useCallback((e: React.TouchEvent) => {
    closeStartYRef.current = e.touches[0].clientY;
    closeTimeRef.current = Date.now();
    closeDirRef.current = null;
    setCloseDragging(true);
  }, []);

  const handleSettingsTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!closeDragging) return;
      const touch = e.touches[0];
      const dy = touch.clientY - closeStartYRef.current;
      const dx = touch.clientX - startXRef.current;

      if (closeDirRef.current === null) {
        if (Math.abs(dy) > 8 || Math.abs(dx) > 8) {
          closeDirRef.current = Math.abs(dy) >= Math.abs(dx);
        }
        return;
      }

      if (closeDirRef.current && dy > 0) {
        setCloseOffset(dy);
      }
    },
    [closeDragging],
  );

  const handleSettingsTouchEnd = useCallback(() => {
    if (!closeDragging) return;
    setCloseDragging(false);

    const elapsed = Math.max(1, Date.now() - closeTimeRef.current);
    const screenH = rootRef.current?.clientHeight || 800;
    const velocity = closeOffset / elapsed;

    if (closeOffset > screenH * SETTINGS_SNAP_FRACTION || velocity > SETTINGS_VELOCITY_THRESHOLD) {
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

  // ─── Compute panel position ───

  const screenH = rootRef.current?.clientHeight || 800;
  const baseTranslate = -currentPage * 100;
  const containerWidth = containerRef.current?.clientWidth || 0;
  const dragPercent = containerWidth ? (translateX / containerWidth) * 100 : 0;

  let panelY: number;
  let panelTransition: string;
  let showPanel: boolean;

  if (settingsOpen) {
    // Open: sits at 0, follows finger down when closing
    panelY = closeDragging ? closeOffset : 0;
    panelTransition = closeDragging ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
    showPanel = true;
  } else if (settingsDragging && settingsReveal > 0) {
    // Opening: panel peeks up from bottom, follows finger
    panelY = screenH - settingsReveal;
    panelTransition = 'none';
    showPanel = true;
  } else {
    panelY = screenH;
    panelTransition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
    showPanel = false;
  }

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden flex flex-col">
      {/* Page indicator dots */}
      <div className="flex items-center justify-center gap-3 py-2 z-10 shrink-0">
        {pageLabels.map((label, i) => (
          <button
            key={label}
            onClick={() => {
              setCurrentPage(i);
              setTranslateX(0);
            }}
            className={`px-3 py-1 text-xs font-medium rounded-pill transition-all duration-200 min-h-[28px]
              ${
                i === currentPage
                  ? 'text-bg-primary bg-[rgba(255,255,255,0.85)]'
                  : 'text-text-muted'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Swipeable pages container */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(${baseTranslate + dragPercent}%)`,
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            width: `${pages.length * 100}%`,
          }}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              className="h-full overflow-y-auto"
              style={{ width: `${100 / pages.length}%` }}
            >
              {page}
            </div>
          ))}
        </div>
      </div>

      {/* Settings swipe handle — visible when settings closed */}
      {!settingsOpen && !settingsDragging && (
        <div className="shrink-0 flex flex-col items-center pb-2 pt-1">
          <div className="w-10 h-1 rounded-full bg-text-muted mb-1" />
          <span className="text-[10px] text-text-muted tracking-wider uppercase">
            Settings
          </span>
        </div>
      )}

      {/* Settings panel — slides up/down following finger */}
      {(showPanel || settingsOpen) && (
        <div
          className="absolute inset-0 z-50 flex flex-col"
          style={{
            transform: `translateY(${panelY}px)`,
            transition: panelTransition,
          }}
          onTouchStart={handleSettingsTouchStart}
          onTouchMove={handleSettingsTouchMove}
          onTouchEnd={handleSettingsTouchEnd}
        >
          {/* Top drag handle */}
          <div className="bg-bg-primary pt-3 pb-1 flex justify-center shrink-0 rounded-t-2xl">
            <div className="w-10 h-1 rounded-full bg-text-muted" />
          </div>

          <div className="flex-1 bg-bg-primary flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle shrink-0">
              <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-sm font-medium text-[rgba(255,255,255,0.85)] min-w-[44px] min-h-[44px]
                           flex items-center justify-center"
              >
                Done
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
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
