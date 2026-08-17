import { useState, useEffect, useId, type ReactNode } from 'react';
import { useNavStore } from '../../store/nav-store';

interface SwipeNavigationProps {
  pages: ReactNode[];
  pageLabels: string[];
  initialPage?: number;
  settingsContent?: ReactNode;
}

/**
 * Explicit mobile navigation shell.
 *
 * The historical name is retained to avoid a broad import migration, but page
 * swiping and swipe-to-dismiss gestures have intentionally been removed. This
 * prevents scroll/control conflicts and follows the app's vertical-navigation
 * design requirement.
 */
export function SwipeNavigation({
  pages,
  pageLabels,
  initialPage = 1,
  settingsContent,
}: SwipeNavigationProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTitleId = useId();

  const targetPage = useNavStore((state) => state.targetPage);
  const clearTarget = useNavStore((state) => state.clearTarget);

  useEffect(() => {
    if (targetPage === null) return;
    if (targetPage >= 0 && targetPage < pages.length) setCurrentPage(targetPage);
    clearTarget();
  }, [targetPage, clearTarget, pages.length]);

  useEffect(() => {
    if (!settingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [settingsOpen]);

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      <main className="flex-1 min-h-0 relative" aria-live="polite">
        {pages.map((page, index) => (
          <div
            key={pageLabels[index] ?? index}
            className="absolute inset-0 overflow-y-auto"
            style={{ display: index === currentPage ? 'block' : 'none' }}
            aria-hidden={index !== currentPage}
          >
            {page}
          </div>
        ))}
      </main>

      <nav
        className="shrink-0 grid border-t border-border-subtle bg-bg-surface/95 backdrop-blur-sm pb-safe"
        style={{ gridTemplateColumns: `repeat(${pageLabels.length + 1}, minmax(0, 1fr))` }}
        aria-label="Primary navigation"
      >
        {pageLabels.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setCurrentPage(index)}
            aria-current={index === currentPage ? 'page' : undefined}
            className={`min-h-[52px] px-1 text-[11px] font-semibold transition-colors
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white
              ${index === currentPage
                ? 'text-text-primary bg-accent-dim'
                : 'text-text-secondary active:bg-bg-raised'
              }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          className="min-h-[52px] px-1 text-[11px] font-semibold text-text-secondary
                     active:bg-bg-raised focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-[-2px] focus-visible:outline-white"
        >
          Settings
        </button>
      </nav>

      {settingsOpen && (
        <div
          className="absolute inset-0 z-50 flex flex-col bg-bg-primary animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby={settingsTitleId}
        >
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
            <h2 id={settingsTitleId} className="text-lg font-semibold text-text-primary flex-1">
              Settings
            </h2>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close Settings"
              className="min-w-[44px] min-h-[44px] rounded-xl border border-border-subtle
                         text-text-primary flex items-center justify-center active:bg-bg-raised
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {settingsContent ?? (
              <div className="flex items-center justify-center h-full text-text-secondary text-sm">
                Settings are unavailable.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
