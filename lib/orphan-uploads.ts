import { prisma } from '@/lib/prisma';
import { deleteFromR2, keyFromR2PublicUrl } from '@/lib/r2';
import { deletedProductAssetKey } from '@/lib/products/claim-product-media';
import { hasProductAssetReferences } from '@/lib/products/product-asset-references';
import { logError } from '@/lib/safe-logger';

/** A stopped worker cannot resume uploading after its durable job is retired. */
export async function markStaleVideoJobsFailed(deadline = Date.now() + 70_000): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  const jobs = await prisma.videoJob.findMany({ where: { status: 'PROCESSING', updatedAt: { lt: cutoff } }, orderBy: { updatedAt: 'asc' }, take: 25 });
  let failed = 0;
  for (const job of jobs) {
    if (Date.now() > deadline) break;
    try {
      failed += await prisma.$transaction(async tx => {
        for (const url of [job.videoUrl, ...(job.posterUrl ? [job.posterUrl] : [])].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${url}, 0))`;
        const result = await tx.videoJob.updateMany({ where: { id: job.id, status: 'PROCESSING', updatedAt: { lt: cutoff } }, data: { status: 'FAILED', error: 'Procesamiento interrumpido (timeout o reinicio del servidor).' } });
        return result.count;
      }, { timeout: 10_000 });
    } catch (error) { logError('video_job_stale_check_failed', error, { operation: 'video_job' }); }
  }
  return failed;
}

/** A durable reservation blocks future claims even when external deletion fails. */
export async function retireVideoAssets(url: string, actorId: string, isSuperAdmin: boolean, dryRun = false): Promise<number> {
  const reserved = await prisma.$transaction(async tx => {
    let job = await tx.videoJob.findFirst({ where: { videoUrl: url } });
    if (!job || (!isSuperAdmin && job.uploadedById !== actorId)) return 403;
    for (const assetUrl of [job.videoUrl, ...(job.posterUrl ? [job.posterUrl] : [])].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${assetUrl}, 0))`;
    }
    job = await tx.videoJob.findUnique({ where: { id: job.id } });
    if (!job) return 403;
    if (job.status === 'PROCESSING' || job.status === 'UPLOADING') return 409;
    if (job.status === 'DELETED') return 200;
    const videoKey = keyFromR2PublicUrl(job.videoUrl);
    const posterKey = job.posterUrl ? keyFromR2PublicUrl(job.posterUrl) : null;
    if (!videoKey?.startsWith('products/') || !videoKey.endsWith('.mp4') ||
        (job.posterUrl && (!posterKey?.startsWith('products/') || !posterKey.endsWith('.webp')))) return 403;
    const urls = [job.videoUrl, ...(job.posterUrl ? [job.posterUrl] : [])].sort();
    for (const assetUrl of urls) if (await hasProductAssetReferences(tx, assetUrl)) return 409;
    if (dryRun) return 200;
    for (const assetUrl of urls) await tx.appConfig.upsert({
      where: { key: deletedProductAssetKey(assetUrl) }, update: { value: assetUrl },
      create: { key: deletedProductAssetKey(assetUrl), value: assetUrl },
    });
    await tx.videoJob.update({ where: { id: job.id }, data: { status: 'DELETING' } });
    return { id: job.id, videoKey, posterKey, urls };
  }, { timeout: 30_000 });
  if (typeof reserved === 'number') return reserved;
  await deleteFromR2(reserved.videoKey);
  if (reserved.posterKey) await deleteFromR2(reserved.posterKey);
  await prisma.$transaction(async tx => {
    await tx.videoJob.updateMany({ where: { id: reserved.id, status: 'DELETING' }, data: { status: 'DELETED' } });
    for (const assetUrl of reserved.urls) await tx.appConfig.update({ where: { key: deletedProductAssetKey(assetUrl) }, data: { value: JSON.stringify({ url: assetUrl, status: 'DELETED' }) } });
  });
  return 200;
}

export async function purgeOrphanProductAssets(dryRun = false, deadline = Date.now() + 80_000): Promise<{ checked: number; deleted: number; failed: number }> {
  const result = { checked: 0, deleted: 0, failed: 0 };
  const stale = new Date(Date.now() - 24 * 60 * 60_000);
  const jobs = await prisma.videoJob.findMany({ where: { OR: [
    { status: { in: ['READY', 'FAILED'] }, updatedAt: { lt: stale } },
    { status: 'DELETING', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
  ] }, orderBy: { updatedAt: 'asc' }, take: 25 });
  for (const job of jobs) {
    if (Date.now() > deadline) break;
    result.checked++;
    try {
      const status = await retireVideoAssets(job.videoUrl, '', true, dryRun);
      if (status === 200) result.deleted++;
      else if (!dryRun) await prisma.videoJob.updateMany({ where: { id: job.id, status: job.status, updatedAt: job.updatedAt }, data: { updatedAt: new Date() } });
    }
    catch (error) { result.failed++; logError('orphan_video_cleanup_failed', error, { provider: 'r2', operation: 'purge_orphan_uploads' }); }
  }
  // URL-valued markers from catalog cleanup are durable retry records. Failed
  // records rotate to the back so one permanently referenced asset cannot
  // starve the queue. Completed markers remain to prevent resurrection.
  const markers = await prisma.appConfig.findMany({ where: { key: { startsWith: 'deleted_product_asset:' }, value: { not: { contains: '"status":"DELETED"' } }, updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, orderBy: { updatedAt: 'asc' }, take: 25 });
  for (const marker of markers) {
    if (Date.now() > deadline) break;
    let url = marker.value;
    try { const parsed = JSON.parse(marker.value) as { url?: string }; if (typeof parsed.url === 'string') url = parsed.url; } catch { /* Historical value is a plain URL. */ }
    const key = keyFromR2PublicUrl(url);
    if (!key || marker.key !== deletedProductAssetKey(url) || !['products/', 'assets/', 'banners/'].some(prefix => key.startsWith(prefix))) continue;
    result.checked++;
    try {
      const canDelete = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${url}, 0))`;
        if (await hasProductAssetReferences(tx, url)) {
          if (!dryRun) await tx.appConfig.update({ where: { id: marker.id }, data: { updatedAt: new Date() } });
          return false;
        }
        return true;
      });
      if (!canDelete) continue;
      if (!dryRun) {
        await deleteFromR2(key);
        await prisma.appConfig.update({ where: { id: marker.id }, data: { value: JSON.stringify({ url, status: 'DELETED' }) } });
      }
      result.deleted++;
    } catch (error) {
      result.failed++;
      if (!dryRun) await prisma.appConfig.updateMany({ where: { id: marker.id }, data: { updatedAt: new Date() } });
      logError('orphan_asset_cleanup_failed', error, { provider: 'r2', operation: 'purge_orphan_uploads' });
    }
  }
  return result;
}
