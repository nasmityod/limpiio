// Only the explicitly isolated audit database can be used by this verification.
async function main() {
  const url = new URL('postgresql://audit_local@127.0.0.1:55439/limpio_audit_test?schema=public');
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/limpio_audit_test') throw new Error('Expected isolated audit database');
  process.env.DATABASE_URL = url.toString();
  process.env.NEXTAUTH_SECRET = 'isolated-admin-audit-only-secret-2026';
  process.env.NEXTAUTH_URL = 'http://127.0.0.1:34567';
  const { prisma } = await import('../../lib/prisma');
  const { patchSettings } = await import('../../lib/data-store');
  const before = await prisma.appConfig.findUnique({ where: { key: 'store_settings' } });
  try {
    for (let round = 0; round < 10; round++) {
      const phone = `ADM03-local-${round}`;
      const binancePayId = `ADM03-financial-${round}`;
      await Promise.all([patchSettings({ phone }), patchSettings({ binancePayId })]);
      const record = await prisma.appConfig.findUniqueOrThrow({ where: { key: 'store_settings' } });
      const saved = JSON.parse(record.value);
      if (saved.phone !== phone || saved.binancePayId !== binancePayId) throw new Error(`Lost update at round ${round}`);
    }
    console.log('ADM03: 10 pairs of concurrent domain saves preserve both fields on real PostgreSQL.');
  } finally {
    if (before) await prisma.appConfig.update({ where: { key: 'store_settings' }, data: { value: before.value } });
    else await prisma.appConfig.deleteMany({ where: { key: 'store_settings' } });
    await prisma.$disconnect();
    await globalThis.prismaRuntime?.pool.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Verification failed'); process.exitCode = 1; });
