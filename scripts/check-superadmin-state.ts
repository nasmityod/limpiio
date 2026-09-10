#!/usr/bin/env tsx
/**
 * RBAC — Verifica el estado del Superadmin en la BD.
 *
 * Exit 0: exactamente un Superadmin con role=ADMIN.
 * Exit 1: cero o más de uno (requiere intervención manual).
 *
 * IMPORTANTE: No ejecutar contra producción desde CI.
 * Este script solo es seguro en entornos de desarrollo o staging aislados.
 *
 * No imprime emails por defecto. Para diagnóstico manual usar --verbose.
 */

import 'dotenv/config';
import { createScriptPrisma } from './lib/script-prisma';

const prisma = createScriptPrisma();
const VERBOSE = process.argv.includes('--verbose');

async function main() {
  let superadminCount: number;
  let superadminRole: string | null = null;

  try {
    const superAdmins = await prisma.user.findMany({
      where:  { isSuperAdmin: true },
      select: {
        id:          true,
        role:        true,
        email:       VERBOSE,
        isSuperAdmin: true,
      },
    });

    superadminCount = superAdmins.length;

    if (superadminCount === 1) {
      superadminRole = superAdmins[0].role;
      if (VERBOSE) {
        process.stdout.write(`  Email: ${(superAdmins[0] as { email?: string }).email ?? '[redactado]'}\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`Error al conectar a la BD: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  process.stdout.write('\n=== Estado del Superadmin ===\n');
  process.stdout.write(`  Superadmins encontrados: ${superadminCount}\n`);

  if (superadminCount === 0) {
    process.stderr.write('\n❌ ERROR: No hay ningún Superadmin configurado.\n');
    process.stderr.write('   Sigue el procedimiento en docs/RUNBOOK-SUPERADMIN-PERMISSIONS.md\n\n');
    process.exit(1);
  }

  if (superadminCount > 1) {
    process.stderr.write('\n❌ ERROR: Hay más de un Superadmin (esto no debería ser posible con el índice único parcial).\n');
    process.stderr.write('   Verifica la integridad de la BD.\n\n');
    process.exit(1);
  }

  if ((superadminRole ?? '').toUpperCase() !== 'ADMIN') {
    process.stderr.write(`\n❌ ERROR: El Superadmin tiene role="${superadminRole}" en lugar de "ADMIN".\n`);
    process.stderr.write('   Corrige el role manualmente en Prisma Studio.\n\n');
    process.exit(1);
  }

  process.stdout.write('  role: ADMIN ✓\n');
  process.stdout.write('\n✅ Estado correcto: exactamente un Superadmin con role=ADMIN.\n\n');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`Error inesperado: ${err}\n`);
  process.exit(1);
});
