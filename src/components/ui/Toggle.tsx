interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ enabled, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        relative w-[44px] h-[24px] rounded-full transition-colors
        ${enabled ? 'bg-[rgba(255,255,255,0.3)]' : 'bg-bg-raised'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div
        className={`
          absolute top-[2px] w-[20px] h-[20px] rounded-full transition-all
          ${enabled ? 'left-[22px] bg-white' : 'left-[2px] bg-text-muted'}
        `}
      />
    </button>
  );
}
