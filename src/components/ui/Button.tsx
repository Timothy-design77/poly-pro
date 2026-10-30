import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'danger-quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  /** Fill the available width. */
  block?: boolean;
  children: ReactNode;
}

/** The one button. Primary is dark ink and reserved for the main action in view. */
export function Button({ variant = 'secondary', size = 'md', block = false, className = '', type = 'button', children, ...props }: ButtonProps) {
  const classes = ['ui-button', `ui-button-${variant}`, size === 'lg' && 'ui-button-lg', block && 'ui-button-block', className]
    .filter(Boolean).join(' ');
  return <button type={type} className={classes} {...props}>{children}</button>;
}
