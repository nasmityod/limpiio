/**
 * RBAC — Permisos administrativos delegables.
 *
 * Esta es la ÚNICA fuente de verdad para los permisos del panel.
 * Modificar aquí primero antes de tocar BD, UI o guards.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ALLOWLIST CANÓNICA
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_PERMISSIONS = [
  'DASHBOARD',
  'ANALYTICS',
  'ORDERS',
  'PAYMENTS',
  'CATALOG',
  'REVIEWS',
  'PROMOTIONS',
  'SITE_CONTENT',
  'STORE_SETTINGS',
  'FINANCIAL_SETTINGS',
  'OPERATIONS',
  'CUSTOMER_DATA_EXPORT',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// METADATOS DE PRESENTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_PERMISSION_META: Record<
  AdminPermission,
  { label: string; description: string; group: string }
> = {
  DASHBOARD: {
    label: 'Mostrador',
    description: 'Ver el resumen operativo y los pedidos recientes.',
    group: 'General',
  },
  ANALYTICS: {
    label: 'Analítica',
    description: 'Ver estadísticas agregadas, ventas y productos más vistos.',
    group: 'General',
  },
  ORDERS: {
    label: 'Pedidos',
    description: 'Ver y gestionar pedidos, estados, envíos y seguimiento.',
    group: 'Ventas',
  },
  PAYMENTS: {
    label: 'Pagos y comprobantes',
    description: 'Ver comprobantes, validar o rechazar pagos y aprobar Binance.',
    group: 'Ventas',
  },
  CATALOG: {
    label: 'Catálogo e inventario',
    description:
      'Gestionar productos, categorías, imágenes, videos, precios y stock.',
    group: 'Catálogo',
  },
  REVIEWS: {
    label: 'Reseñas',
    description: 'Moderar, aprobar y administrar reseñas de clientes.',
    group: 'Catálogo',
  },
  PROMOTIONS: {
    label: 'Promociones',
    description: 'Gestionar cupones, promociones y descuentos.',
    group: 'Marketing',
  },
  SITE_CONTENT: {
    label: 'Contenido del sitio',
    description:
      'Gestionar Home, banners, personalización, anuncios y SEO local.',
    group: 'Marketing',
  },
  STORE_SETTINGS: {
    label: 'Configuración de tienda',
    description: 'Editar datos generales, contacto y estimados de envío.',
    group: 'Configuración',
  },
  FINANCIAL_SETTINGS: {
    label: 'Configuración financiera',
    description:
      'Editar cuentas de pago, tasa, fórmula de precios y parámetros financieros.',
    group: 'Configuración',
  },
  OPERATIONS: {
    label: 'Operaciones técnicas',
    description:
      'Ver health, backups, crons y herramientas operativas internas.',
    group: 'Seguridad y datos',
  },
  CUSTOMER_DATA_EXPORT: {
    label: 'Exportar datos de clientes',
    description: 'Exportar CSV de pedidos con información personal.',
    group: 'Seguridad y datos',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CONJUNTO PARA LOOKUP O(1)
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_PERMISSIONS_SET = new Set<string>(ADMIN_PERMISSIONS);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES SEMÁNTICAS PURAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard: comprueba que `value` sea un AdminPermission válido de la allowlist.
 * Rechaza wildcards, prefijos, strings desconocidos y cualquier otro valor.
 */
export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === 'string' && ADMIN_PERMISSIONS_SET.has(value);
}

/**
 * Normaliza un array arbitrario a AdminPermission[]:
 * - descarta valores desconocidos;
 * - elimina duplicados;
 * - mantiene el orden canónico de ADMIN_PERMISSIONS.
 */
export function normalizeAdminPermissions(values: unknown): AdminPermission[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<AdminPermission>();
  const result: AdminPermission[] = [];
  // Iterar en orden canónico para garantizar consistencia
  for (const perm of ADMIN_PERMISSIONS) {
    if (
      values.some((v) => v === perm) &&
      !seen.has(perm)
    ) {
      seen.add(perm);
      result.push(perm);
    }
  }
  return result;
}

/**
 * Comprueba si un usuario tiene acceso a un permiso concreto.
 *
 * Reglas:
 * - Superadmin → siempre true, aunque `permissions` esté vacío.
 * - Usuario normal → true únicamente si el permiso está explícitamente en el array.
 * - El permiso debe ser parte de ADMIN_PERMISSIONS; cualquier otro valor retorna false.
 */
export function hasAdminPermission(
  access: {
    isSuperAdmin: boolean;
    permissions: readonly string[];
  },
  permission: AdminPermission,
): boolean {
  if (!isAdminPermission(permission)) return false;
  if (access.isSuperAdmin) return true;
  return access.permissions.includes(permission);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE NAVEGACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Permisos agrupados según ADMIN_PERMISSION_META.group, en orden de aparición
 * canónico. Útil para renderizar el diálogo de checkboxes.
 */
export function getPermissionsByGroup(): Array<{
  group: string;
  permissions: AdminPermission[];
}> {
  const groupMap = new Map<string, AdminPermission[]>();
  for (const perm of ADMIN_PERMISSIONS) {
    const { group } = ADMIN_PERMISSION_META[perm];
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group)!.push(perm);
  }
  return Array.from(groupMap.entries()).map(([group, permissions]) => ({
    group,
    permissions,
  }));
}

/**
 * Primer permiso que tiene el usuario, según orden de prioridad de navegación.
 * Útil para redirigir si no tiene DASHBOARD.
 */
const NAVIGATION_PRIORITY: AdminPermission[] = [
  'ORDERS',
  'PAYMENTS',
  'CATALOG',
  'REVIEWS',
  'PROMOTIONS',
  'SITE_CONTENT',
  'ANALYTICS',
  'STORE_SETTINGS',
  'FINANCIAL_SETTINGS',
  'OPERATIONS',
];

export const ADMIN_PERMISSION_HOME: Record<AdminPermission, string> = {
  DASHBOARD: '/admin',
  ANALYTICS: '/admin/stats',
  ORDERS: '/admin/orders',
  PAYMENTS: '/admin/orders',
  CATALOG: '/admin/products',
  REVIEWS: '/admin/reviews',
  PROMOTIONS: '/admin/coupons',
  SITE_CONTENT: '/admin/personalizar',
  STORE_SETTINGS: '/admin/settings',
  FINANCIAL_SETTINGS: '/admin/settings',
  OPERATIONS: '/admin',
  CUSTOMER_DATA_EXPORT: '/admin/orders',
};

/**
 * Añade dependencias implícitas entre permisos.
 * PAYMENTS y CUSTOMER_DATA_EXPORT requieren ORDERS.
 */
export function normalizePermissionDependencies(
  permissions: readonly AdminPermission[],
): AdminPermission[] {
  const set = new Set<AdminPermission>(permissions);
  if (set.has('PAYMENTS')) set.add('ORDERS');
  if (set.has('CUSTOMER_DATA_EXPORT')) set.add('ORDERS');
  return normalizeAdminPermissions([...set]);
}

export function getFirstAuthorizedPermission(
  access: { isSuperAdmin: boolean; permissions: readonly string[] },
): AdminPermission | null {
  if (access.isSuperAdmin) return 'DASHBOARD';
  if (access.permissions.includes('DASHBOARD')) return 'DASHBOARD';
  for (const perm of NAVIGATION_PRIORITY) {
    if (access.permissions.includes(perm)) return perm;
  }
  return null;
}
