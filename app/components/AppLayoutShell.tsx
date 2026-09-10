'use client';

import { usePathname } from 'next/navigation';

/**
 * Decide cómo envolver el contenido según la ruta.
 * - En /admin/* renderiza el children directamente (sin container ni footer).
 * - En el resto, aplica el container de la tienda + Footer.
 *
 * El Footer y el children se reciben como props (server-rendered),
 * así que SSR funciona normalmente; este componente solo decide la
 * visibilidad/envoltorio en el cliente.
 */
export default function AppLayoutShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      {/* id + tabIndex: destino del skip link "Saltar al contenido" (PRD-055). */}
      <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-full overflow-x-hidden outline-none">
        <div className="container mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-5 sm:py-8 lg:py-10">
          {children}
        </div>
      </main>
      {footer}
    </>
  );
}
