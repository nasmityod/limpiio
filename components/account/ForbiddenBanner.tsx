'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldX } from 'lucide-react';

/**
 * Detecta ?error=forbidden en la URL, muestra un aviso y luego limpia el param
 * para que la barra de dirección quede limpia.
 */
export default function ForbiddenBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const isForbidden = params.get('error') === 'forbidden';

  useEffect(() => {
    if (!isForbidden) return;
    // Eliminar el query param sin añadir una entrada al historial
    router.replace('/account/orders', { scroll: false });
  }, [isForbidden, router]);

  if (!isForbidden) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6"
    >
      <ShieldX size={16} className="mt-0.5 shrink-0 text-red-500" />
      <span>
        No tienes permisos para acceder a esa sección. Si crees que esto es un error, contacta con soporte.
      </span>
    </div>
  );
}
