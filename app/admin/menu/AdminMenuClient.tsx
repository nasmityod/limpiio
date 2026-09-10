'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { ChevronRight, LogOut, ExternalLink } from 'lucide-react';
import type { NavGroup } from '@/lib/admin-nav';

export default function AdminMenuClient({ filteredGroups }: { filteredGroups: NavGroup[] }) {
  return (
    <div className="md:hidden space-y-5">
      <div>
        <h1 className="text-xl font-black text-navy">Menú completo</h1>
        <p className="text-xs text-gray-500 mt-0.5">Todas las secciones del panel.</p>
      </div>

      {filteredGroups.map(group => (
        <div key={group.id}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1 mb-2">
            {group.label}
          </p>
          <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden">
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 min-h-[60px]"
              >
                <span className="w-10 h-10 rounded-xl bg-amber-50 text-navy flex items-center justify-center flex-shrink-0">
                  <item.icon size={20} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">
                    {item.label}
                    {item.badge === 'new' && (
                      <span className="ml-1.5 text-[9px] font-black uppercase bg-brand-yellow text-navy px-1.5 py-0.5 rounded">
                        new
                      </span>
                    )}
                  </p>
                  {item.description && (
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">{item.description}</p>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden mt-6">
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 min-h-[60px]"
        >
          <span className="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
            <ExternalLink size={18} />
          </span>
          <span className="text-sm font-semibold text-gray-700 flex-1">Ir a la tienda pública</span>
          <ChevronRight size={16} className="text-gray-300" />
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-red-50 min-h-[60px] text-left"
        >
          <span className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
            <LogOut size={18} />
          </span>
          <span className="text-sm font-semibold text-red-600 flex-1">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}
