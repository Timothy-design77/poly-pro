import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'danger-quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'lg';
  /** Fill the available width. */
  block?: boolean;
  children: ReactNode;
}

/** The one button. Primary is dark ink and reserved for the main action in view. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block = false, className = '', type = 'button', children, ...props },
  ref,
) {
  const classes = ['ui-button', `ui-button-${variant}`, size === 'lg' && 'ui-button-lg', block && 'ui-button-block', className]
    .filter(Boolean).join(' ');
  return <button ref={ref} type={type} className={classes} {...props}>{children}</button>;
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only controls need an accessible name. */
  'aria-label': string;
  children: ReactNode;
}

/** 44px square hit area around a small icon. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', type = 'button', children, ...props },
  ref,
) {
  return <button ref={ref} type={type} className={`ui-icon-button ${className}`} {...props}>{children}</button>;
});
