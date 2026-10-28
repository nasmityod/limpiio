import { NextResponse } from 'next/server';
import { purgeOrphanReviewPhotos } from '@/lib/review-photo-assets';
import { purgeOrphanProductAssets, markStaleVideoJobsFailed } from '@/lib/orphan-uploads';
import { logError } from '@/lib/safe-logger';
import { verifyBearerSecret } from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Cron no configurado.' }, { status: 503 });
  if (!verifyBearerSecret(request, secret)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  try {
    const deadline = Date.now() + 70_000;
    const interruptedVideos = dryRun ? 0 : await markStaleVideoJobsFailed(deadline);
    const reviews = await purgeOrphanReviewPhotos(dryRun, deadline);
    const products = await purgeOrphanProductAssets(dryRun, deadline);
    const ok = reviews.failed === 0 && products.failed === 0;
    return NextResponse.json({ ok, dryRun, interruptedVideos, reviews, products }, { status: ok ? 200 : 502 });
  } catch (error) {
    logError('orphan_uploads_cron_failed', error, { operation: 'purge_orphan_uploads' });
    return NextResponse.json({ error: 'No se pudo limpiar los archivos pendientes.' }, { status: 500 });
  }
}
