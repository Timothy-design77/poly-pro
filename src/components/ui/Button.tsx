import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variantStyles = {
  primary: 'bg-[rgba(255,255,255,0.85)] text-bg-primary active:bg-[rgba(255,255,255,0.95)]',
  secondary: 'bg-bg-surface border-[1.5px] border-border-subtle text-text-secondary active:bg-bg-raised active:border-border-emphasis',
  ghost: 'bg-transparent text-text-secondary active:bg-bg-raised',
};

const sizeStyles = {
  sm: 'h-[36px] text-xs px-3 rounded-lg',
  md: 'h-[44px] text-sm px-4 rounded-xl',
  lg: 'h-[52px] text-sm px-5 rounded-[14px]',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        flex items-center justify-center gap-2 font-bold tracking-wider
        transition-all touch-manipulation select-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
