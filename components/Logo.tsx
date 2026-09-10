import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export type LogoVariant = 'light' | 'dark' | 'auto';

const SRC: Record<'light' | 'dark', string> = {
  light: '/logo-light.png',
  dark:  '/logo-dark.png',
};

// Per-variant aspect ratios from processed PNGs:
//   logo-light.png (MUNDO negro, para fondo claro)   478×133 → 3.5940
//   logo-dark.png  (MUNDO blanco, para fondo navy)   480×151 → 3.1788
const RATIO: Record<'light' | 'dark', number> = {
  light: 478 / 133,   // ≈ 3.5940
  dark:  480 / 151,   // ≈ 3.1788
};
const SIZES = {
  sm: { height: 40, className: 'h-9 w-auto' },
  md: { height: 48, className: 'h-11 w-auto sm:h-12' },
  lg: { height: 56, className: 'h-14 w-auto' },
} as const;

export interface LogoProps {
  /** light = fondo claro · dark = fondo negro · auto = hereda data-logo-surface del contenedor */
  variant?: LogoVariant;
  size?: keyof typeof SIZES;
  className?: string;
  /** false = sin enlace a inicio */
  href?: string | false;
  priority?: boolean;
  /** Nombre de marca para alt/aria (desde readSettings). */
  storeName?: string;
  slogan?: string;
}

/**
 * Logo de marca. Usar variant="light" en navbar/fondos blancos
 * y variant="dark" en bandas negras (footer, auth, hero, admin).
 */
export default function Logo({
  variant = 'light',
  size = 'md',
  className,
  href = '/',
  priority = false,
  storeName,
  slogan,
}: LogoProps) {
  const resolvedVariant = variant === 'dark' ? 'dark' : 'light';
  const src = SRC[resolvedVariant];
  const dims = SIZES[size];
  const ratio = RATIO[resolvedVariant];
  const width = Math.round(dims.height * ratio);
  const brandLabel = storeName?.trim() || 'MundoTech';
  const alt =
    slogan?.trim()
      ? `${brandLabel} — ${slogan.trim()}`
      : `${brandLabel} — Conectados Contigo`;
  const homeLabel = `${brandLabel} — Ir al inicio`;

  const img = (extra?: string) => (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={dims.height}
      priority={priority}
      className={cn('object-contain', dims.className, extra, className)}
    />
  );

  if (href === false) {
    return <span className="inline-flex items-center">{img()}</span>;
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 rounded-lg"
      aria-label={homeLabel}
    >
      {img()}
    </Link>
  );
}
