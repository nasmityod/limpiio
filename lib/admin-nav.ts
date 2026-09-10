import {
  Home, Package, Tag, ShoppingCart, BarChart2,
  Image as ImageIcon, LayoutDashboard, Users, MapPin, Store,
  Wallet, Palette, MoreHorizontal, Ticket, Star, Megaphone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AdminPermission } from '@/lib/admin-permissions';
import type { CurrentAdminAccess } from '@/lib/admin-access-server';
import { hasAdminPermission } from '@/lib/admin-permissions';

export interface NavItem {
  href:            string;
  label:           string;
  icon:            LucideIcon;
  badge?:          'new';
  description?:    string;
  /** Si está definido, el ítem solo se muestra si el usuario tiene este permiso. */
  permission?:     AdminPermission;
  /** Si está definido, basta con tener cualquiera de estos permisos. */
  anyOfPermissions?: AdminPermission[];
  /** Si true, visible para cualquier usuario con acceso al backoffice. */
  backofficeOnly?:  boolean;
  /** Si true, el ítem solo se muestra al Superadmin. */
  superAdminOnly?: boolean;
}

export interface NavGroup {
  id:    string;
  label: string;
  items: NavItem[];
}

/**
 * Estructura completa para el sidebar de escritorio.
 * Incluye campo `permission` y `superAdminOnly` para filtrar por acceso.
 */
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Hoy en la tienda',
    items: [
      { href: '/admin',       label: 'Mostrador', icon: Home,      description: 'Lo que está pasando hoy', permission: 'DASHBOARD' },
      { href: '/admin/stats', label: 'Analítica', icon: BarChart2, description: 'Qué se vende y qué se mira', permission: 'ANALYTICS' },
    ],
  },
  {
    id: 'catalog',
    label: 'Catálogo',
    items: [
      { href: '/admin/products',   label: 'Productos',  icon: Package,    description: 'Inventario y precios', permission: 'CATALOG' },
      { href: '/admin/categories', label: 'Categorías', icon: Tag,        description: 'Slugs SEO',           permission: 'CATALOG' },
      { href: '/admin/reviews',    label: 'Reseñas',    icon: Star,       description: 'Lo que dicen los clientes', permission: 'REVIEWS' },
    ],
  },
  {
    id: 'sales',
    label: 'Ventas',
    items: [
      { href: '/admin/orders',  label: 'Pedidos', icon: ShoppingCart, description: 'En curso y archivo', permission: 'ORDERS' },
      { href: '/admin/coupons', label: 'Cupones', icon: Ticket,       description: 'Descuentos',         permission: 'PROMOTIONS' },
    ],
  },
  {
    id: 'site',
    label: 'Tu vitrina',
    items: [
      { href: '/admin/personalizar',          label: 'Personalizar sitio', icon: Palette,        description: 'Hero, badges, WhatsApp, popup', badge: 'new', permission: 'SITE_CONTENT' },
      { href: '/admin/home-manager',          label: 'Gestor Home',        icon: LayoutDashboard, description: 'Bloques de la home',            permission: 'SITE_CONTENT' },
      { href: '/admin/banners',               label: 'Banners',            icon: ImageIcon,       description: 'Hero y CTA',                   permission: 'SITE_CONTENT' },
      { href: '/admin/settings/announcement', label: 'Barra de anuncios',  icon: Megaphone,       description: 'Mensaje superior',             permission: 'SITE_CONTENT' },
      { href: '/admin/settings/seo-local',    label: 'SEO Local',          icon: MapPin,          description: 'Dirección · horarios',         permission: 'SITE_CONTENT' },
    ],
  },
  {
    id: 'config',
    label: 'Configuración',
    items: [
      { href: '/admin/settings', label: 'Tienda y pagos', icon: Store, anyOfPermissions: ['STORE_SETTINGS', 'FINANCIAL_SETTINGS'] },
      { href: '/admin/settings/users', label: 'Usuarios',       icon: Users, superAdminOnly: true },
    ],
  },
];

/**
 * Para el bottom-nav móvil: los 5 destinos más usados, en orden de pulgar.
 */
export const ADMIN_BOTTOM_NAV: NavItem[] = [
  { href: '/admin',          label: 'Mostrador', icon: Home,           permission: 'DASHBOARD' },
  { href: '/admin/orders',   label: 'Pedidos',   icon: ShoppingCart,   permission: 'ORDERS' },
  { href: '/admin/products', label: 'Catálogo',  icon: Package,        permission: 'CATALOG' },
  { href: '/admin/stats',    label: 'Analítica', icon: BarChart2,      permission: 'ANALYTICS' },
  { href: '/admin/menu',     label: 'Más',       icon: MoreHorizontal, backofficeOnly: true },
];

export const FLAT_ADMIN_NAV: NavItem[] = ADMIN_NAV_GROUPS.flatMap(g => g.items);

/**
 * Filtra los grupos de navegación según el acceso del usuario.
 * El Superadmin ve todo. Los usuarios normales solo ven las secciones autorizadas.
 */
function isNavItemVisible(item: NavItem, access: CurrentAdminAccess): boolean {
  if (item.superAdminOnly) return access.isSuperAdmin;
  if (item.backofficeOnly) return access.isSuperAdmin || access.permissions.length > 0;
  if (item.anyOfPermissions?.length) {
    return item.anyOfPermissions.some((perm) => hasAdminPermission(access, perm));
  }
  if (item.permission) return hasAdminPermission(access, item.permission);
  return false;
}

export function filterNavGroups(
  groups: NavGroup[],
  access: CurrentAdminAccess,
): NavGroup[] {
  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item => isNavItemVisible(item, access)),
    }))
    .filter(group => group.items.length > 0);
}

export function filterBottomNav(
  items: NavItem[],
  access: CurrentAdminAccess,
): NavItem[] {
  return items.filter(item => isNavItemVisible(item, access));
}

/**
 * Devuelve el título legible de la ruta admin actual (para el header móvil).
 */
export function getActiveLabel(pathname: string): string {
  if (pathname === '/admin') return 'Mostrador';
  if (pathname === '/admin/menu') return 'Menú';
  const found = FLAT_ADMIN_NAV.find(i =>
    i.href !== '/admin' && pathname.startsWith(i.href),
  );
  return found?.label ?? 'Panel';
}

export function isItemActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

export { ImageIcon, LayoutDashboard, Wallet, Palette };
