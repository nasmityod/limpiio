import type { Metadata } from 'next';
import UnsubscribeConfirmClient from './UnsubscribeConfirmClient';

export const metadata: Metadata = {
  title: 'Cancelar suscripción',
  robots: { index: false, follow: false },
};

/**
 * PRD-179: página de confirmación de baja de remarketing de carrito abandonado.
 *
 * El GET de /api/cart/unsubscribe valida el token y redirige aquí.
 * Esta página muestra el botón "Confirmar baja"; el clic hace POST al API.
 * Así los escáneres de correo (que prefetch el GET del enlace) no disparan
 * la baja por sí mismos.
 */
export default async function UnsubscribeConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token?.trim()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-red-500 text-sm">
            Enlace inválido o expirado. Si esto es un error, contáctanos.
          </p>
        </div>
      </div>
    );
  }

  return <UnsubscribeConfirmClient token={token.trim()} />;
}
