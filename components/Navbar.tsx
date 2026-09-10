'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ShoppingBag, Heart, Phone, Mail,
  UserCircle, LogOut, Package, Settings,
  LayoutDashboard, ChevronDown, Menu,
  Store, Truck, Search,
} from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useCart }     from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import SearchBar          from './SearchBar';
import { isAdminRole } from '@/lib/is-admin-role';
import Logo from '@/components/Logo';

// PERF-02 (AUDITORIA-2026-07): los overlays viven en chunks aparte y solo se
// montan tras la primera apertura — framer-motion sale del bundle crítico.
const SearchMobileOverlay = dynamic(() => import('./SearchMobileOverlay'), { ssr: false });
const CategoryDrawer      = dynamic(() => import('./layout/CategoryDrawer'), { ssr: false });

export interface NavbarContact {
  phone: string;
  phone2?: string;
  email: string;
  /** PRD-112: dirección física desde readSettings() — nada hardcodeado aquí. */
  address: string;
  /** PRD-285: claim logístico desde site-content (admin) — vacío = no se muestra. */
  deliveryNote?: string;
}

const Navbar = ({ onCartClick, contact }: { onCartClick: () => void; contact: NavbarContact }) => {
  const { data: session, status: sessionStatus } = useSession();
  const { cart, isCartLoading, itemAdded } = useCart();
  const { wishlist, isWishlistLoading }    = useWishlist();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [scrolled,     setScrolled]     = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  // PERF-02: los chunks de los overlays solo se descargan tras el primer uso.
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const openDrawer = () => { setDrawerMounted(true); setDrawerOpen(true); };
  const openMobileSearch = () => { setSearchMounted(true); setMobileSearchOpen(true); };

  const totalItems = !isCartLoading && cart
    ? cart.reduce((acc, item) => acc + item.quantity, 0)
    : 0;
  const isAdmin  = isAdminRole(session?.user?.role);

  // Sombra/blur progresivo
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener('pointerdown', handler, { passive: true });
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  return (
    <>
      {drawerMounted && (
        <CategoryDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      )}
      {searchMounted && (
        <SearchMobileOverlay open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />
      )}

      <header className="sticky top-0 z-40 w-full max-w-full overflow-visible">
        {/* Top bar trust — solo desktop */}
        <div className="hidden sm:block bg-navy text-white/70">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px]
                          flex justify-between items-center py-2 text-[11px]">
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-1.5">
                <Phone size={11} /> {contact.phone}{contact.phone2 ? ` · ${contact.phone2}` : ''}
              </span>
              <span className="flex items-center gap-1.5"><Mail size={11} /> {contact.email}</span>
            </div>
            <div className="flex items-center gap-4 text-white/80">
              {contact.address ? (
                <span className="flex items-center gap-1.5"><Store size={11} className="text-brand-yellow" /> Tienda física: {contact.address}</span>
              ) : null}
              {contact.deliveryNote ? (
                <span className="hidden md:flex items-center gap-1.5"><Truck size={11} className="text-brand-yellow" /> {contact.deliveryNote}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Header principal */}
        <div
          className={`transition-all duration-200 ${
            scrolled
              ? 'bg-white/95 backdrop-blur-md shadow-soft border-b border-border/60'
              : 'bg-white border-b border-border'
          }`}
        >
          <div className="container mx-auto px-3 sm:px-6 lg:px-8 max-w-[1400px]">
            <div className="flex items-center h-[60px] sm:h-[72px] gap-2 sm:gap-5 overflow-x-clip">

              {/* Hamburguesa + Logo */}
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <button
                  type="button"
                  onClick={openDrawer}
                  className="lg:hidden flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl text-navy hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  aria-label="Abrir menú de categorías"
                >
                  <Menu size={22} aria-hidden="true" />
                </button>

                {/* PERF-04: sin priority — la imagen LCP es el hero, no el logo. */}
                <Logo variant="light" size="md" className="h-8 w-auto sm:h-12 ml-0.5 sm:ml-1" />

                <button
                  type="button"
                  onClick={openDrawer}
                  className="hidden lg:inline-flex ml-3 items-center gap-1.5 text-sm font-semibold text-navy/80
                             hover:text-navy hover:bg-slate-100 transition-colors px-3 py-2 rounded-xl"
                >
                  <Menu size={15} aria-hidden="true" />
                  Categorías
                </button>
              </div>

              {/* SearchBar dominante en desktop */}
              <div className="hidden md:block flex-grow max-w-2xl mx-auto min-w-0">
                <SearchBar placeholder="Buscar productos, marcas y más..." />
              </div>

              {/* Acciones derecha — <nav> semántico con aria-label (navegación principal) */}
              <nav
                aria-label="Navegación principal"
                className="flex items-center gap-0.5 sm:gap-1 ml-auto md:ml-0 flex-shrink-0"
              >

                {/* Búsqueda móvil */}
                <button
                  type="button"
                  onClick={openMobileSearch}
                  className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl text-navy hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  aria-label="Abrir búsqueda"
                >
                  <Search size={20} aria-hidden="true" />
                </button>

                {/* Wishlist — espacio reservado para el badge (evita CLS al hidratar) */}
                <Link
                  href="/wishlist"
                  className="relative flex items-center justify-center min-w-[44px] min-h-[44px] text-navy/80 hover:text-navy hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors"
                  aria-label={wishlist.length > 0 ? `Lista de deseos (${wishlist.length})` : 'Lista de deseos'}
                >
                  <span className="sr-only">Lista de deseos</span>
                  <Heart size={20} aria-hidden="true" />
                  <span
                    className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center ring-2 ring-white"
                    aria-hidden="true"
                  >
                    {!isWishlistLoading && wishlist.length > 0 ? (
                      <span className="bg-rose-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                        {wishlist.length}
                      </span>
                    ) : null}
                  </span>
                </Link>

                {/* Cuenta — skeleton neutro mientras useSession resuelve */}
                {sessionStatus === 'loading' ? (
                  <div
                    className="flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-xl"
                    aria-hidden="true"
                  >
                    <div className="w-7 h-7 rounded-full bg-slate-200" />
                  </div>
                ) : session ? (
                  <div className="relative" ref={userMenuRef}>
                    <button
                      type="button"
                      onClick={() => setUserMenuOpen(v => !v)}
                      className="flex items-center gap-2 min-w-[44px] min-h-[44px] px-2 sm:pl-2 sm:pr-3 text-navy
                                 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors"
                      aria-label="Mi cuenta"
                      aria-haspopup="menu"
                      aria-expanded={userMenuOpen}
                    >
                      <div className="w-7 h-7 rounded-full bg-navy text-brand-yellow flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                        {(session.user?.name?.[0] ?? 'U').toUpperCase()}
                      </div>
                      <span className="hidden lg:block text-sm font-semibold max-w-[100px] truncate">
                        {session.user?.name?.split(' ')[0] ?? 'Cuenta'}
                      </span>
                      <ChevronDown size={13} aria-hidden="true" className={`hidden lg:block transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* PERF-02: animación CSS (animate-menu-in) en vez de framer-motion. */}
                    {userMenuOpen && (
                        <div
                          role="menu"
                          aria-label="Menú de cuenta"
                          className="absolute right-0 mt-2 w-[min(calc(100vw-1rem),16rem)] bg-white rounded-2xl shadow-lift
                                     border border-slate-200/70 py-2 z-[70] overflow-hidden
                                     animate-menu-in motion-reduce:animate-none"
                        >
                          <div className="px-4 py-3 border-b border-slate-100">
                            <p className="text-sm font-semibold text-navy truncate">{session.user?.name}</p>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{session.user?.email}</p>
                          </div>
                          <div className="py-1">
                            {[
                              { href: '/account/orders',  icon: Package,  label: 'Mis pedidos' },
                              { href: '/account/details', icon: Settings, label: 'Mi perfil'   },
                              { href: '/wishlist',        icon: Heart,    label: 'Favoritos'   },
                            ].map(item => (
                              <Link
                                key={item.href} href={item.href}
                                role="menuitem"
                                onClick={() => setUserMenuOpen(false)}
                                className="flex items-center gap-3 px-4 min-h-[44px] text-sm text-navy/80 hover:bg-slate-50 hover:text-navy transition-colors"
                              >
                                <item.icon size={16} className="text-slate-400 flex-shrink-0" /> {item.label}
                              </Link>
                            ))}
                          </div>
                          {isAdmin && (
                            <div className="border-t border-slate-100 py-1">
                              <Link
                                href="/admin" role="menuitem" onClick={() => setUserMenuOpen(false)}
                                className="flex items-center gap-3 px-4 min-h-[44px] text-sm text-amber-700 font-semibold hover:bg-amber-50 transition-colors"
                              >
                                <LayoutDashboard size={16} className="flex-shrink-0" /> Panel admin
                              </Link>
                            </div>
                          )}
                          <div className="border-t border-slate-100 py-1">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setUserMenuOpen(false); signOut({ callbackUrl: '/' }); }}
                              className="flex items-center gap-3 w-full px-4 min-h-[44px] text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <LogOut size={16} className="flex-shrink-0" /> Cerrar sesión
                            </button>
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <Link
                    href="/login"
                    aria-label="Iniciar sesión"
                    className="flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] sm:px-3 text-navy
                               hover:bg-slate-100 active:bg-slate-200 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <span className="sr-only">Iniciar sesión</span>
                    <UserCircle size={20} aria-hidden="true" />
                    <span className="hidden sm:inline">Entrar</span>
                  </Link>
                )}

                {/* Carrito — siempre accesible con pulgar.
                    PERF-02: pop de "añadido" con animación CSS (animate-cart-pop). */}
                <button
                  type="button"
                  onClick={onCartClick}
                  className={`relative flex items-center gap-1.5 sm:gap-2 min-h-[44px] px-2 sm:pl-3 sm:pr-4 ml-0 sm:ml-1
                             bg-navy text-white text-sm font-semibold rounded-full
                             hover:bg-navy-700 active:bg-navy-800 shadow-soft hover:shadow-card transition-all
                             ${itemAdded ? 'animate-cart-pop motion-reduce:animate-none' : ''}`}
                  aria-label="Carrito de compras"
                >
                  <span className="sr-only">Carrito de compras</span>
                  <ShoppingBag size={18} aria-hidden="true" />
                  <span className="hidden sm:inline">Carrito</span>
                  <span className="inline-flex min-w-[20px] h-5 items-center justify-center" aria-hidden={totalItems === 0}>
                    {!isCartLoading && totalItems > 0 ? (
                      <span className="bg-brand-yellow text-navy text-[11px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center nums">
                        {totalItems}
                      </span>
                    ) : null}
                  </span>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default Navbar;
