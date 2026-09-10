import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Accede a tu cuenta MundoTech para pedidos, favoritos y checkout rápido.',
  // H12/P96/H03: página de auth — fuera del índice y con canonical propio
  // (antes heredaba el canonical de la home desde el layout raíz).
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
