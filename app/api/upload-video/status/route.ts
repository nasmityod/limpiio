import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-access-server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const STALE_JOB_MS = 10 * 60_000;

async function markStaleVideoJobsFailed(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  await prisma.videoJob.updateMany({
    where: {
      status: 'PROCESSING',
      updatedAt: { lt: cutoff },
    },
    data: {
      status: 'FAILED',
      error: 'Procesamiento interrumpido (timeout o reinicio del servidor).',
    },
  });
}

export async function GET(request: Request) {
  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  await markStaleVideoJobsFailed();

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId?.trim()) {
    return NextResponse.json({ error: 'Falta jobId.' }, { status: 400 });
  }

  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });

  if (!job) {
    return NextResponse.json({ error: 'Trabajo no encontrado.' }, { status: 404 });
  }

  const statusMap: Record<string, string> = {
    PROCESSING: 'processing',
    READY: 'ready',
    FAILED: 'failed',
  };

  return NextResponse.json({
    status: statusMap[job.status] ?? job.status.toLowerCase(),
    url: job.videoUrl,
    posterUrl: job.posterUrl,
    width: job.width,
    height: job.height,
    durationS: job.durationS,
    error: job.error,
  });
}
