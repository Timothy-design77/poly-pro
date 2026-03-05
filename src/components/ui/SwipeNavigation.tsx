import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';

interface SwipeNavigationProps {
  pages: ReactNode[];
  pageLabels: string[];
  initialPage?: number;
  settingsContent?: ReactNode;
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;

export function SwipeNavigation({
  pages,
  pageLabels,
  initialPage = 1,
  settingsContent,
}: SwipeNavigationProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const isHorizontalRef = useRef<boolean | null>(null);

  const getPageOffset = useCallback(
    (page: number) => -page * 100,
    [],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (settingsOpen) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    isHorizontalRef.current = null;
    setIsDragging(true);
  }, [settingsOpen]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (settingsOpen) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      // Determine direction on first significant movement
      if (isHorizontalRef.current === null) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          isHorizontalRef.current = Math.abs(dx) > Math.abs(dy);
        }
        return;
      }

      if (!isHorizontalRef.current) return;

      // Rubber-band at edges
      let adjustedDx = dx;
      if (
        (currentPage === 0 && dx > 0) ||
        (currentPage === pages.length - 1 && dx < 0)
      ) {
        adjustedDx = dx * 0.25;
      }

      setTranslateX(adjustedDx);
    },
    [currentPage, pages.length, settingsOpen],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const elapsed = Date.now() - startTimeRef.current;
    const velocity = Math.abs(translateX) / elapsed;

    let newPage = currentPage;
    if (
      Math.abs(translateX) > SWIPE_THRESHOLD ||
      velocity > VELOCITY_THRESHOLD
    ) {
      if (translateX > 0 && currentPage > 0) {
        newPage = currentPage - 1;
      } else if (translateX < 0 && currentPage < pages.length - 1) {
        newPage = currentPage + 1;
      }
    }

    setCurrentPage(newPage);
    setTranslateX(0);
    isHorizontalRef.current = null;
  }, [isDragging, translateX, currentPage, pages.length]);

  // Settings handle drag
  const settingsStartY = useRef(0);
  const [settingsTranslateY, setSettingsTranslateY] = useState(0);
  const [settingsDragging, setSettingsDragging] = useState(false);

  const handleSettingsHandleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    settingsStartY.current = e.touches[0].clientY;
    setSettingsDragging(true);
  }, []);

  const handleSettingsHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!settingsDragging) return;
    e.stopPropagation();
    const dy = settingsStartY.current - e.touches[0].clientY;
    if (dy > 0) setSettingsTranslateY(Math.min(dy, 100));
  }, [settingsDragging]);

  const handleSettingsHandleTouchEnd = useCallback(() => {
    setSettingsDragging(false);
    if (settingsTranslateY > 40) {
      setSettingsOpen(true);
    }
    setSettingsTranslateY(0);
  }, [settingsTranslateY]);

  // Close settings on back/escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && settingsOpen) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settingsOpen]);

  const baseTranslate = getPageOffset(currentPage);
  const containerWidth = containerRef.current?.clientWidth || 0;
  const dragPercent = containerWidth
    ? (translateX / containerWidth) * 100
    : 0;

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
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

      {/* Settings handle */}
      {!settingsOpen && (
        <div
          className="shrink-0 flex flex-col items-center pb-2 pt-1 cursor-pointer"
          onTouchStart={handleSettingsHandleTouchStart}
          onTouchMove={handleSettingsHandleTouchMove}
          onTouchEnd={handleSettingsHandleTouchEnd}
          onClick={() => setSettingsOpen(true)}
          style={{
            transform: settingsTranslateY > 0
              ? `translateY(${-settingsTranslateY * 0.3}px)`
              : undefined,
          }}
        >
          <div className="w-10 h-1 rounded-full bg-text-muted mb-1" />
          <span className="text-[10px] text-text-muted tracking-wider uppercase">
            Settings
          </span>
        </div>
      )}

      {/* Settings overlay */}
      {settingsOpen && (
        <div
          className="absolute inset-0 z-50 bg-bg-primary flex flex-col"
          style={{
            animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
            <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
            <button
              onClick={() => setSettingsOpen(false)}
              className="text-sm font-medium text-[rgba(255,255,255,0.85)] min-w-[44px] min-h-[44px]
                         flex items-center justify-center"
            >
              Done
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {settingsContent || (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Settings coming in Phase 2
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
