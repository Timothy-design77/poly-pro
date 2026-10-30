import type { ReactNode } from 'react';

export interface SegmentOption<T> {
  value: T;
  label: ReactNode;
  /** Accessible name when the visible label is abbreviated. */
  ariaLabel?: string;
}

/** A small set of mutually exclusive choices, exposed as pressed toggle buttons. */
export function SegmentedControl<T extends string | number>({
  label, options, value, onChange, disabled = false, className = '',
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`ui-segmented ${className}`}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          aria-label={option.ariaLabel}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
