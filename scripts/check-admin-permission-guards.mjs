#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const LEGACY_ALLOWLIST = new Set([
  'lib/api-auth.ts',
  'middleware.ts',
  'lib/is-admin-role.ts',
  'app/checkout/success/page.tsx',
  'components/Navbar.tsx',
  'app/admin/settings/users/UsersClient.tsx',
  'scripts/normalize-admin-role.ts',
]);

const LEGACY_PATTERNS = [
  { name: 'requireAdmin()', pattern: /requireAdmin\s*\(/ },
  { name: 'requireAdminAction()', pattern: /requireAdminAction\s*\(/ },
  { name: 'updateUserRole', pattern: /\bupdateUserRole\b/ },
];

const ROLE_BYPASS_PATTERNS = [
  { name: 'isAdminRole(', pattern: /\bisAdminRole\s*\(/ },
  { name: "role === 'ADMIN'", pattern: /role\s*===\s*['"]ADMIN['"]/ },
  { name: "role.toUpperCase() === 'ADMIN'", pattern: /role\.toUpperCase\(\)\s*===\s*['"]ADMIN['"]/ },
  { name: "role: 'ADMIN'", pattern: /role\s*:\s*['"]ADMIN['"]/ },
  { name: "role: parsed.data.role", pattern: /role\s*:\s*parsed\.data\.role/ },
];

const SCAN_DIRS = ['app/api', 'app/actions'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const EXCLUDE_DIRS = new Set(['node_modules', '.next', '.git']);

function scanDirectory(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...scanDirectory(fullPath));
    else if (entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      results.push(fullPath);
    }
  }
  return results;
}

function getRelativePath(absolutePath) {
  return absolutePath.slice(ROOT.length + 1).replace(/\\/g, '/');
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

let violations = 0;
const violationLines = [];

for (const scanDir of SCAN_DIRS) {
  for (const filePath of scanDirectory(join(ROOT, scanDir))) {
    const rel = getRelativePath(filePath);
    if (rel.includes('.test.') || rel.includes('/tests/')) continue;

    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;

      for (const { name, pattern } of [...LEGACY_PATTERNS, ...ROLE_BYPASS_PATTERNS]) {
        if (!pattern.test(line)) continue;
        if (LEGACY_ALLOWLIST.has(rel)) {
          process.stdout.write(`  ⚠  LEGACY (allowlist): ${rel}:${i + 1} — ${name}\n`);
        } else {
          violations++;
          violationLines.push(`  ✗  VIOLACIÓN: ${rel}:${i + 1} — ${name} — ${line.trim()}`);
        }
        break;
      }
    }
  }
}

if (violationLines.length > 0) {
  process.stderr.write('\n🔴 RBAC Guard Check — FALLÓ\n\n');
  for (const v of violationLines) process.stderr.write(`${v}\n`);
  process.stderr.write('\nUsar requirePermission()/requirePermissionAction() de lib/admin-access-server.ts.\n\n');
  process.exit(1);
}

process.stdout.write('\n✅ RBAC Guard Check — OK\n\n');
process.exit(0);
