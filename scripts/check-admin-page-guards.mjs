#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ADMIN_ROOT = join(ROOT, 'app/admin');

const GUARD_PATTERNS = [
  /requireAdminPagePermission\s*\(/,
  /requireAdminPageAnyPermission\s*\(/,
  /requireAdminPageSuperAdmin\s*\(/,
  /requireBackofficeAction\s*\(/,
];

const SECTION_GUARD_MAP = [
  { route: 'stats', guard: 'requireAdminPagePermission' },
  { route: 'orders', guard: 'requireAdminPagePermission' },
  { route: 'products', guard: 'requireAdminPagePermission' },
  { route: 'categories', guard: 'requireAdminPagePermission' },
  { route: 'reviews', guard: 'requireAdminPagePermission' },
  { route: 'coupons', guard: 'requireAdminPagePermission' },
  { route: 'personalizar', guard: 'requireAdminPagePermission' },
  { route: 'home-manager', guard: 'requireAdminPagePermission' },
  { route: 'banners', guard: 'requireAdminPagePermission' },
  { route: 'settings/announcement', guard: 'requireAdminPagePermission' },
  { route: 'settings/seo-local', guard: 'requireAdminPagePermission' },
  { route: 'settings/users', guard: 'requireAdminPageSuperAdmin' },
  { route: 'settings', guard: 'requireAdminPageAnyPermission' },
];

const EXEMPT_ROUTES = new Set(['unauthorized', 'menu']);

function fileHasGuard(filePath) {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf8');
  return GUARD_PATTERNS.some((pattern) => pattern.test(content));
}

function routeHasGuard(route) {
  const dir = join(ADMIN_ROOT, route);
  const layoutPath = join(dir, 'layout.tsx');
  const pagePath = join(dir, 'page.tsx');

  if (fileHasGuard(layoutPath) || fileHasGuard(pagePath)) return true;

  let current = dir;
  while (current.startsWith(ADMIN_ROOT)) {
    const parentLayout = join(current, 'layout.tsx');
    if (fileHasGuard(parentLayout)) return true;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (route === '') {
    return fileHasGuard(join(ADMIN_ROOT, 'page.tsx'));
  }

  return false;
}

function listAdminRoutes(dir, prefix = '') {
  const routes = [];
  if (!existsSync(dir)) return routes;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (EXEMPT_ROUTES.has(entry)) continue;
    const route = prefix ? `${prefix}/${entry}` : entry;
    routes.push(route);
    routes.push(...listAdminRoutes(full, route));
  }
  return routes;
}

const violations = [];

for (const { route, guard } of SECTION_GUARD_MAP) {
  if (!routeHasGuard(route)) {
    violations.push(`  ✗  ${route || '/admin'} — falta guard (${guard}) en layout.tsx o page.tsx`);
  }
}

if (!fileHasGuard(join(ADMIN_ROOT, 'page.tsx'))) {
  violations.push('  ✗  /admin — falta guard de dashboard/redirect en page.tsx');
}

if (!fileHasGuard(join(ADMIN_ROOT, 'layout.tsx'))) {
  violations.push('  ✗  /admin — falta requireBackofficeAction en layout.tsx');
}

const discovered = listAdminRoutes(ADMIN_ROOT);
for (const route of discovered) {
  if (EXEMPT_ROUTES.has(route.split('/').pop() ?? route)) continue;
  if (SECTION_GUARD_MAP.some((entry) => entry.route === route)) continue;
  if (route.startsWith('settings/users')) continue;
  if (!routeHasGuard(route)) {
    violations.push(`  ✗  /admin/${route} — ruta admin sin guard detectado`);
  }
}

if (violations.length > 0) {
  process.stderr.write('\n🔴 Admin Page Guard Check — FALLÓ\n\n');
  for (const v of violations) process.stderr.write(`${v}\n`);
  process.exit(1);
}

process.stdout.write('\n✅ Admin Page Guard Check — OK\n\n');
process.exit(0);
