import type { Metadata } from 'next';
import WishlistClient from './WishlistClient';

// H13/H03: la página era 100% Client Component y no podía exportar metadata —
// heredaba index + canonical de la home pese al Disallow de robots.txt.
// Este wrapper servidor declara noindex y canonical propio; la UI vive en
// WishlistClient (sin cambios de comportamiento).
export const metadata: Metadata = {
  title: 'Mi lista de deseos',
  description: 'Tus productos favoritos guardados en MundoTech, listos para pasar al carrito.',
  alternates: { canonical: '/wishlist' },
  robots: { index: false, follow: true },
};

export default function WishlistPage() {
  return <WishlistClient />;
}
