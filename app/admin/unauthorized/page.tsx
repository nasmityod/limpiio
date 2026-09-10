import Link from 'next/link';
import { ShieldX } from 'lucide-react';

export const metadata = {
  title: 'Acceso denegado',
  robots: { index: false },
};

export default function AdminUnauthorizedPage() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <ShieldX className="h-14 w-14 text-red-400" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">
          No tienes permiso para acceder a esta sección
        </h1>
        <p className="text-gray-500 max-w-md">
          Si crees que esto es un error, contacta al administrador de la tienda.
        </p>
      </div>
      <Link
        href="/admin"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
      >
        Volver al panel
      </Link>
    </main>
  );
}
