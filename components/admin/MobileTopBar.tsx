'use client';

import { Menu, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getActiveLabel } from '@/lib/admin-nav';

interface MobileTopBarProps {
  onOpenDrawer: () => void;
  storeName: string;
}

export default function MobileTopBar({ onOpenDrawer, storeName }: MobileTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isDeep = pathname !== '/admin' && pathname.split('/').length > 3;
  const title = getActiveLabel(pathname);

  return (
    <header
      className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 flex items-center px-2 h-14"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {isDeep ? (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Volver"
          className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 transition touch-manipulation"
        >
          <ArrowLeft size={20} className="text-navy" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Abrir menú"
          className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 transition touch-manipulation"
        >
          <Menu size={22} className="text-navy" />
        </button>
      )}

      <div className="flex-1 min-w-0 px-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 leading-none">{storeName} Admin</p>
        <h1 className="text-base font-black text-navy truncate leading-tight mt-0.5">{title}</h1>
      </div>

      <Link
        href="/"
        aria-label="Ir a la tienda"
        className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 transition touch-manipulation text-[10px] font-bold text-gray-500"
      >
        Tienda
      </Link>
    </header>
  );
}
