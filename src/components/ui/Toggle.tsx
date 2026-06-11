interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ enabled, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        relative w-[44px] h-[24px] rounded-full transition-colors duration-200
        ${enabled ? 'bg-[rgba(255,255,255,0.3)]' : 'bg-bg-raised'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div
        className={`
          absolute top-[2px] w-[20px] h-[20px] rounded-full
          transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${enabled ? 'left-[22px] bg-white' : 'left-[2px] bg-text-muted'}
        `}
      />
    </button>
  );
}
