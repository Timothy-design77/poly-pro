import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variantStyles = {
  primary: 'bg-accent text-bg-primary active:bg-accent-hover',
  secondary: 'bg-bg-surface border-[1.5px] border-border-subtle text-text-primary active:bg-bg-raised active:border-border-emphasis',
  ghost: 'bg-transparent text-text-secondary active:bg-bg-raised',
};

const sizeStyles = {
  sm: 'h-[40px] text-xs px-3 rounded-lg',
  md: 'h-[48px] text-sm px-4 rounded-xl',
  lg: 'h-[54px] text-sm px-5 rounded-[14px]',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`
        flex items-center justify-center gap-2 font-bold tracking-wider
        transition-all touch-manipulation select-none
        active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none
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
