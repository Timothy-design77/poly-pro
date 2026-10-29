interface ToggleProps {
  enabled: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ enabled, label, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      role="switch"
      aria-checked={enabled}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        relative w-[48px] h-[44px] shrink-0 flex items-center justify-center rounded-lg
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span aria-hidden="true" className={`relative block w-[44px] h-[24px] rounded-full ${enabled ? 'bg-accent' : 'bg-bg-raised border border-border-emphasis'}`}>
        <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full ${enabled ? 'left-[23px] bg-white' : 'left-[2px] bg-text-muted'}`} />
      </span>
    </button>
  );
}
