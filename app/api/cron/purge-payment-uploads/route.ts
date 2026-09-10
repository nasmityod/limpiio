import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deletePrivateProof } from '@/lib/r2';
import { verifyBearerSecret } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export const dynamic = 'force-dynamic';

const BATCH_LIMIT = 100;

/**
 * GET /api/cron/purge-payment-uploads
 *
 * SESIÓN 05 (CORREGIDO): limpia registros PaymentUpload PENDING o UPLOADING
 * cuyo expiresAt ya venció. Por cada uno:
 *   1. Reclama atómicamente (PENDING|UPLOADING) → DELETING con updateMany condicional.
 *   2. Si tiene objectKey, lo borra del bucket privado R2.
 *   3. Marca DELETED.
 * Si R2 falla, revierte DELETING → estado anterior (previousStatus) para reintento.
 * Si no hay objectKey, marca DELETED directamente.
 *
 * Protección: Authorization: Bearer <CRON_SECRET> (timing-safe).
 */
function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return verifyBearerSecret(request, cronSecret);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let purged = 0;
  let r2Errors = 0;
  let attempted = 0;

  try {
    const now = new Date();
    const expired = await prisma.paymentUpload.findMany({
      where: {
        status: {
          in: ['PENDING', 'UPLOADING'],
        },
        expiresAt: { lte: now },
      },
      take: BATCH_LIMIT,
      orderBy: { expiresAt: 'asc' },
      select: {
        id: true,
        objectKey: true,
        status: true,
      },
    });

    attempted = expired.length;

    for (const record of expired) {
      const previousStatus = record.status;

      // Reclamo atómico: (PENDING|UPLOADING) → DELETING
      const claim = await prisma.paymentUpload.updateMany({
        where: {
          id: record.id,
          status: previousStatus,
          expiresAt: { lte: now },
        },
        data: {
          status: 'DELETING',
        },
      });

      if (claim.count !== 1) {
        continue; // otra corrida lo tomó
      }

      if (record.objectKey) {
        try {
          await deletePrivateProof(record.objectKey);
        } catch (r2Err) {
          logError('cron_purge_uploads_r2_failed', r2Err, { operation: 'purge_payment_uploads', provider: 'r2' });
          r2Errors++;

          // Revertir a estado anterior para reintento futuro
          await prisma.paymentUpload.updateMany({
            where: {
              id: record.id,
              status: 'DELETING',
            },
            data: {
              status: previousStatus,
            },
          });
          continue;
        }
      }

      // Marcar DELETED
      const deleted = await prisma.paymentUpload.updateMany({
        where: {
          id: record.id,
          status: 'DELETING',
        },
        data: {
          status: 'DELETED',
        },
      });

      if (deleted.count !== 1) {
        logError('cron_purge_uploads_mark_deleted_failed', new Error('Could not mark DELETED'), { operation: 'purge_payment_uploads' });
        continue;
      }

      purged++;
    }

    // Registrar última ejecución exitosa para health check
    if (purged > 0 || r2Errors === 0) {
      await prisma.appConfig.upsert({
        where: { key: 'purge_payment_uploads_last_success_at' },
        update: { value: new Date().toISOString() },
        create: {
          key: 'purge_payment_uploads_last_success_at',
          value: new Date().toISOString(),
        },
      });
    }

    logInfo('cron_purge_payment_uploads', { count: purged, operation: 'purge_payment_uploads' });

    return NextResponse.json({
      ok: true,
      purged,
      r2Errors,
      attempted,
    });
  } catch (err) {
    logError('cron_purge_payment_uploads_error', err, { operation: 'purge_payment_uploads' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
