import { prisma } from '@/lib/prisma';
import { requireAdminPagePermission } from '@/lib/admin-access-server';
import { OPS_APP_CONFIG_KEYS, buildAdminOperationsHealth, buildOpsMap, type AdminOperationsHealth } from '@/lib/operations-health';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  await requireAdminPagePermission('OPERATIONS');
  let health: AdminOperationsHealth | null = null;
  let pendingEmails = 0;
  let reviewEmails = 0;
  try {
    const rows = await prisma.appConfig.findMany({
      where: { key: { in: [...OPS_APP_CONFIG_KEYS] } }, select: { key: true, value: true },
    });
    health = buildAdminOperationsHealth(buildOpsMap(rows));
    [pendingEmails, reviewEmails] = await Promise.all([
      prisma.emailDelivery.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.emailDelivery.count({ where: { status: 'REVIEW' } }),
    ]);
  } catch { health = null; }
  if (!health) return <section className="p-6"><h1 className="text-2xl font-semibold">Operaciones técnicas</h1><p role="alert" className="mt-4">No se pudo consultar el estado operativo. Intenta recargar la página.</p></section>;
    const labels = { bcv: 'Tasa BCV', backup: 'Respaldo', purge: 'Limpieza de archivos' };
    return <section className="p-6"><h1 className="text-2xl font-semibold">Operaciones técnicas</h1>
      <p className="mt-2 text-slate-500">Últimas ejecuciones registradas por los procesos de la tienda.</p>
      <dl className="mt-6 grid gap-4 md:grid-cols-3">{(Object.keys(labels) as Array<keyof typeof labels>).map((key) =>
        <div key={key} className="rounded-xl border p-4"><dt className="font-semibold">{labels[key]}</dt>
          <dd className="mt-2">{health[key].lastSuccessAt ? new Date(health[key].lastSuccessAt!).toLocaleString('es-VE', { timeZone: 'America/Caracas' }) : 'Sin ejecución registrada'}</dd>
          <dd className="mt-2">{health[key].stale ? 'Requiere revisión' : 'Actualizado'}</dd></div>)}</dl>
      <p className="mt-6">Correos pendientes de aceptación: {pendingEmails}. Solicitudes que requieren revisión: {reviewEmails}.</p>
      {reviewEmails > 0 && <p role="alert" className="mt-2">Hay solicitudes de correo cuyo resultado debe comprobarse en el proveedor antes de reintentarlas.</p>}
    </section>;
}
