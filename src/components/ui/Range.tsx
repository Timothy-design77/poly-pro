import type { CSSProperties, InputHTMLAttributes } from 'react';

interface RangeProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max'> {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  'aria-label': string;
}

/** Native slider with the shared track/thumb and a filled portion. */
export function Range({ value, min, max, onChange, className = '', style, ...props }: RangeProps) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={`ui-range ${className}`}
      style={{ '--fill': `${fill}%`, ...style } as CSSProperties}
      {...props}
    />
  );
}
