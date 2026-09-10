import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0B1220',
          50:  '#F4F6FA',
          100: '#E5E9F2',
          200: '#C5CDDD',
          300: '#9AA6BF',
          400: '#5F6E8C',
          500: '#1A202C',
          600: '#141A26',
          700: '#111826',
          800: '#0B1220',
          900: '#070B14',
        },
        brand: {
          yellow:    '#FFD700',
          yellowDk:  '#E6C200',
          yellowSft: '#FFF8D1',
          green:     '#48BB78',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted:   '#F8FAFC',
          sunken:  '#F8FAFC',
        },
        'brand-yellow': '#FFD700',
        'brand-green':  '#48BB78',
        primary:        '#0B1220',
        accent:         '#FFD700',
        border:         '#E2E8F0',
        /* Contraste WCAG AA — texto sobre fondos claros u oscuros */
        'on-light': {
          DEFAULT: '#475569', /* slate-600 ≈ 7:1 sobre blanco */
          muted:   '#64748b', /* slate-500 — solo ≥18px bold / ≥24px */
        },
        'on-dark': {
          DEFAULT: '#d1d5db', /* gray-300 ≈ 9:1 sobre navy */
          muted:   'rgba(255,255,255,0.70)',
        },
        'price-on-light': '#a16207', /* amber-700 ≈ 4.7:1 sobre blanco */
      },
      fontFamily: {
        sans: ['var(--font-jost)', 'Jost', 'Arial', 'Helvetica', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter:  '-0.03em',
        tight:    '-0.02em',
        normal:   '0em',
      },
      borderRadius: {
        'xl':  '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        'soft':  '0 1px 2px rgba(11,18,32,0.04), 0 1px 3px rgba(11,18,32,0.06)',
        'card':  '0 4px 12px -2px rgba(11,18,32,0.06), 0 2px 4px -2px rgba(11,18,32,0.04)',
        'lift':  '0 12px 32px -8px rgba(11,18,32,0.18), 0 4px 8px -2px rgba(11,18,32,0.06)',
        'glass': 'inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 24px -6px rgba(11,18,32,0.12)',
        'ring-navy': '0 0 0 4px rgba(11,18,32,0.08)',
        'ring-yellow': '0 0 0 4px rgba(255,215,0,0.25)',
        'e0': 'none',
        'e1': '0 1px 2px rgba(11,18,32,0.04)',
        'e2': '0 4px 12px -2px rgba(11,18,32,0.06)',
        'e3': '0 12px 32px -8px rgba(11,18,32,0.18)',
        'float':      '0 12px 32px -8px rgba(11,18,32,0.18)',
        'card-hover': '0 16px 40px -10px rgba(11,18,32,0.2)',
      },
      keyframes: {
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // PERF-02: animaciones CSS que sustituyen a framer-motion en la ruta
        // crítica (Navbar/CookieConsent) — menos JS inicial en móvil.
        'cart-pop': {
          '0%':   { transform: 'scale(1)' },
          '45%':  { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        'menu-in': {
          '0%':   { opacity: '0', transform: 'translateY(-8px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        shimmer:  'shimmer 1.6s linear infinite',
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'cart-pop': 'cart-pop 0.32s ease-out',
        'menu-in':  'menu-in 0.18s ease-out both',
      },
      backgroundImage: {
        'noise':
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='4'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
    },
  },
  plugins: [],
}

export default config
