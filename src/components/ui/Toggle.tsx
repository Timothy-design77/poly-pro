interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  /** Human-readable setting name announced by assistive technology. */
  label?: string;
}

export function Toggle({
  enabled,
  onChange,
  disabled = false,
  label = 'Toggle setting',
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={enabled}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        relative w-[44px] h-[24px] rounded-full transition-colors duration-200
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
        ${enabled ? 'bg-[rgba(255,255,255,0.45)]' : 'bg-bg-raised border border-border-emphasis'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        aria-hidden="true"
        className={`
          absolute top-[2px] w-[20px] h-[20px] rounded-full
          transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${enabled ? 'left-[22px] bg-white' : 'left-[2px] bg-text-secondary'}
        `}
      />
    </button>
  );
}
