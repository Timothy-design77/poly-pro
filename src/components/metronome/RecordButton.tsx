/**
 * Record button — present in P2 but recording not wired until P4.
 * Shows disabled state with tooltip.
 */
export function RecordButton() {
  return (
    <button
      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl
                 border-[1.5px] border-border-subtle bg-bg-surface
                 text-text-secondary text-xs font-bold tracking-wide
                 active:bg-bg-raised transition-colors h-[44px]
                 touch-manipulation select-none"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" className="text-danger" fill="currentColor">
        <circle cx="12" cy="12" r="10" />
      </svg>
      RECORD
    </button>
  );
}
