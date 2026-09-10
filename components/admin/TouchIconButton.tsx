'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'default' | 'danger' | 'primary' | 'ghost';

interface TouchIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  label: string;
  icon: React.ReactNode;
  /** En desktop oculta el label; en móvil siempre 44×44. */
  iconOnly?: boolean;
}

const STYLES: Record<Variant, string> = {
  default: 'text-gray-600 hover:text-navy hover:bg-gray-100 active:bg-gray-200',
  danger:  'text-gray-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100',
  primary: 'text-navy hover:bg-amber-50 active:bg-amber-100',
  ghost:   'text-gray-500 active:bg-gray-100',
};

export const TouchIconButton = forwardRef<HTMLButtonElement, TouchIconButtonProps>(
  function TouchIconButton({ variant = 'default', label, icon, iconOnly = true, className = '', ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl transition ${STYLES[variant]} ${className}`}
        {...props}
      >
        {icon}
        {!iconOnly && <span className="text-sm font-semibold">{label}</span>}
      </button>
    );
  },
);

export default TouchIconButton;
