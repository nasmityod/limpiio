/**
 * Migración one-shot: normaliza el campo `role` de la tabla User a UPPERCASE.
 *
 * Antes: el schema tenía @default("client") y mezcla de "admin" / "ADMIN".
 * Ahora: la app espera siempre "ADMIN" o "CLIENT" en mayúsculas (ver lib/api-auth#isAdminRole).
 *
 * Ejecutar:
 *   npx tsx scripts/normalize-admin-role.ts
 */
import dotenv from 'dotenv';
import { createScriptPrisma } from './lib/script-prisma';

dotenv.config({ path: '.env.local' });
dotenv.config();

const prisma = createScriptPrisma();

async function main() {
  const all = await prisma.user.findMany({ select: { id: true, role: true, email: true } });
  console.log(`📊 Total de usuarios: ${all.length}`);

  let updated = 0;
  for (const u of all) {
    const target = (u.role ?? 'CLIENT').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'CLIENT';
    if (u.role !== target) {
      await prisma.user.update({ where: { id: u.id }, data: { role: target } });
      console.log(`  • ${u.email}: "${u.role}" → "${target}"`);
      updated++;
    }
  }

  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  console.log(`\n✓ ${updated} usuarios actualizados.`);
  console.log(`✓ ${adminCount} administradores en total.`);
  if (adminCount === 0) {
    console.warn(
      '\n⚠ No hay ningún ADMIN. Crea uno desde /admin/settings/users (necesitarás promover a un usuario manualmente vía SQL primero):',
    );
    console.warn('  UPDATE "User" SET role = \'ADMIN\' WHERE email = \'admin@ejemplo.com\';');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
