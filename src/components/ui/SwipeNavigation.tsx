import { useEffect, useState, type ReactNode } from 'react';
import { useNavStore } from '../../store/nav-store';

interface SwipeNavigationProps {
  pages: ReactNode[];
  pageLabels: string[];
  initialPage?: number;
  settingsContent?: ReactNode;
}

/**
 * Tap-only application navigation.
 *
 * The component keeps the historical export name so existing imports remain
 * stable, but horizontal page swiping and swipe-to-open settings are
 * intentionally disabled. Mobile navigation is explicit and predictable:
 * page buttons live at the bottom and Settings opens from a dedicated button.
 */
export function SwipeNavigation({
  pages,
  pageLabels,
  initialPage = 1,
  settingsContent,
}: SwipeNavigationProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const targetPage = useNavStore((s) => s.targetPage);
  const clearTarget = useNavStore((s) => s.clearTarget);

  useEffect(() => {
    if (targetPage === null) return;

    if (targetPage >= 0 && targetPage < pages.length) {
      setCurrentPage(targetPage);
      setSettingsOpen(false);
    }
    clearTarget();
  }, [targetPage, pages.length, clearTarget]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen]);

  const navigateToPage = (index: number) => {
    setCurrentPage(index);
    setSettingsOpen(false);
  };

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col bg-bg-primary">
      {/* Active page. No horizontal track, touch handlers, or page-swipe gestures. */}
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
      </main>

      {/* Bottom navigation keeps page changes deliberate and away from the BPM controls. */}
      <nav
        className="shrink-0 border-t border-border-subtle bg-bg-surface px-2 pt-2 pb-safe"
        aria-label="Primary navigation"
      >
        <div className="grid grid-cols-4 gap-1.5 max-w-lg mx-auto">
          {pageLabels.map((label, index) => {
            const active = index === currentPage && !settingsOpen;
            return (
              <button
                key={label}
                type="button"
                onClick={() => navigateToPage(index)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[48px] rounded-md px-2 py-2 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-accent text-bg-primary'
                    : 'bg-bg-raised text-text-secondary active:bg-accent-dim active:text-text-primary'
                }`}
              >
                {label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-expanded={settingsOpen}
            className={`min-h-[48px] rounded-md px-2 py-2 text-xs font-semibold transition-colors ${
              settingsOpen
                ? 'bg-accent text-bg-primary'
                : 'bg-bg-raised text-text-secondary active:bg-accent-dim active:text-text-primary'
            }`}
          >
            Settings
          </button>
        </div>
      </nav>

      {settingsOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-bg-primary animate-fade-in">
          <header className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-border-subtle bg-bg-surface">
            <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="min-h-[44px] min-w-[72px] rounded-md bg-bg-raised px-3 text-sm font-semibold text-text-primary active:bg-accent-dim"
            >
              Done
            </button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {settingsContent || (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                No settings available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
