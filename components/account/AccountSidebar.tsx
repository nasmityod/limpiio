'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { ShoppingBag, User, Lock, LogOut, Heart, MapPin } from 'lucide-react';

const navItems = [
  { href: '/account/orders',     label: 'Mis pedidos',    icon: ShoppingBag },
  { href: '/account/details',    label: 'Mi perfil',      icon: User },
  { href: '/account/addresses',  label: 'Mis direcciones', icon: MapPin },
  { href: '/account/password',   label: 'Contraseña',     icon: Lock },
  { href: '/wishlist',           label: 'Favoritos',      icon: Heart },
];

const AccountSidebar = () => {
  const pathname = usePathname();
  const { data: session } = useSession();

  const initial = (session?.user?.name?.[0] ?? 'U').toUpperCase();

  // Móvil: el sidebar completo apilado obligaba a scrollear ~300px antes de
  // ver los pedidos. En <lg la navegación pasa a tabs horizontales scrollables.
  return (
    <aside className="bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden">
      <div className="px-4 py-3 lg:px-5 lg:py-5 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-navy text-brand-yellow flex items-center justify-center text-base lg:text-lg font-bold flex-shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy truncate">
            {session?.user?.name ?? 'Mi cuenta'}
          </p>
          <p className="text-[12px] text-slate-500 truncate">
            {session?.user?.email ?? ''}
          </p>
        </div>
      </div>

      <nav className="p-2 flex lg:block gap-1 lg:gap-0 lg:space-y-0.5 overflow-x-auto scrollbar-hide snap-x-mandatory lg:overflow-visible">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex items-center gap-2 lg:gap-3 px-3.5 h-11 rounded-xl text-sm transition-colors flex-shrink-0 whitespace-nowrap ${
                isActive
                  ? 'bg-slate-100 text-navy font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
              }`}
            >
              {isActive && <span className="hidden lg:block absolute left-0 top-2 bottom-2 w-1 rounded-full bg-brand-yellow" />}
              <item.icon size={16} className={isActive ? 'text-navy' : 'text-slate-400'} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* Cerrar sesión: al final de la fila en móvil */}
        <button type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="lg:hidden flex items-center gap-2 px-3.5 h-11 rounded-xl text-sm text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors flex-shrink-0 whitespace-nowrap"
        >
          <LogOut size={16} />
          <span>Salir</span>
        </button>
      </nav>

      <div className="hidden lg:block p-2 border-t border-slate-100">
        <button type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex items-center gap-3 px-3.5 h-11 w-full rounded-xl text-sm text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors"
        >
          <LogOut size={16} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
};

export default AccountSidebar;
