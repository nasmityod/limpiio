import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { keyFromR2PublicUrl, deleteFromR2 } from '@/lib/r2';
import { logError } from '@/lib/safe-logger';

export class ReviewPhotoError extends Error {}
export function reviewPhotoPrefix(userId: string): string {
  return `reviews/${createHash('sha256').update(userId).digest('hex')}/`;
}
export function reviewPhotosBelongToUser(urls: readonly string[], userId: string, existing: readonly string[] = []): boolean {
  return urls.every(url => existing.includes(url) || keyFromR2PublicUrl(url)?.startsWith(reviewPhotoPrefix(userId)) === true);
}
function deletedPhotoKey(url: string): string {
  return `deleted_review_asset:${createHash('sha256').update(url).digest('hex')}`;
}

export async function reserveReviewPhotoUpload(userId: string, url: string, objectKey: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'review-upload:' + userId}, 0))`;
    const count = await tx.reviewPhotoUpload.count({ where: { userId, status: { in: ['UPLOADING', 'READY'] }, expiresAt: { gt: new Date() } } });
    if (count >= 8) throw new ReviewPhotoError('Ya tienes varias fotos pendientes. Guarda tu reseña antes de subir más.');
    return tx.reviewPhotoUpload.create({ data: { userId, url, objectKey, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
  });
}

/** Link and delete take the same sorted URL locks, preventing resurrected files. */
export async function claimReviewPhotos(tx: Prisma.TransactionClient, urls: readonly string[], userId: string, existing: readonly string[] = []): Promise<void> {
  if (!reviewPhotosBelongToUser(urls, userId, existing)) throw new ReviewPhotoError('Las fotos deben haber sido subidas desde tu cuenta.');
  const unique = [...new Set(urls)].sort();
  for (const url of unique) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${url}, 0))`;
  if (!unique.length) return;
  const deleted = await tx.appConfig.findFirst({ where: { key: { in: unique.map(deletedPhotoKey) } }, select: { id: true } });
  if (deleted) throw new ReviewPhotoError('Una foto fue eliminada. Vuelve a subirla antes de guardar.');
  const uploads = await tx.reviewPhotoUpload.findMany({ where: { url: { in: unique }, userId }, select: { url: true, status: true, expiresAt: true } });
  for (const url of unique) {
    const upload = uploads.find(photo => photo.url === url);
    // Historical photos with no metadata may be retained, never newly copied.
    if (!upload && existing.includes(url)) continue;
    if (!upload || !['READY', 'LINKED'].includes(upload.status) || (upload.status === 'READY' && upload.expiresAt <= new Date())) {
      throw new ReviewPhotoError('La foto no está disponible. Vuelve a subirla.');
    }
  }
  await tx.reviewPhotoUpload.updateMany({ where: { userId, url: { in: unique }, status: 'READY' }, data: { status: 'LINKED' } });
}

export async function deleteReviewPhotosFromR2(urls: readonly string[], ownerId?: string | null): Promise<void> {
  if (!ownerId) return;
  for (const url of [...new Set(urls)].sort()) {
    const key = keyFromR2PublicUrl(url);
    if (!key?.startsWith(reviewPhotoPrefix(ownerId))) continue;
    try {
      const reserved = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${url}, 0))`;
        const upload = await tx.reviewPhotoUpload.findUnique({ where: { url } });
        if (!upload || upload.userId !== ownerId || upload.objectKey !== key || upload.status === 'DELETED') return null;
        if (await tx.review.count({ where: { photos: { has: url } } })) return null;
        await tx.appConfig.upsert({ where: { key: deletedPhotoKey(url) }, update: { value: 'true' }, create: { key: deletedPhotoKey(url), value: 'true' } });
        await tx.reviewPhotoUpload.update({ where: { id: upload.id }, data: { status: 'DELETING' } });
        return upload.id;
      });
      if (!reserved) continue;
      await deleteFromR2(key);
      await prisma.reviewPhotoUpload.updateMany({ where: { id: reserved, status: 'DELETING' }, data: { status: 'DELETED' } });
    } catch (error) {
      logError('review_photo_delete_failed', error, { operation: 'delete_review_photo', provider: 'r2' });
    }
  }
}

export async function purgeOrphanReviewPhotos(dryRun = false, deadline = Date.now() + 80_000): Promise<{ checked: number; deleted: number; failed: number }> {
  const records = await prisma.$queryRaw<Array<{ id: string; url: string; userId: string }>>`
    SELECT u.id, u.url, u."userId" FROM "ReviewPhotoUpload" u
    WHERE (u.status IN ('UPLOADING', 'READY', 'FAILED') AND u."expiresAt" < CURRENT_TIMESTAMP)
       OR (u.status = 'DELETING' AND u."updatedAt" < CURRENT_TIMESTAMP - interval '5 minutes')
       OR (u.status = 'LINKED' AND u."updatedAt" < CURRENT_TIMESTAMP - interval '24 hours'
           AND NOT EXISTS (SELECT 1 FROM "Review" r WHERE r.photos @> ARRAY[u.url]::text[]))
    ORDER BY u."updatedAt" ASC LIMIT 25`;
  let deleted = 0;
  let failed = 0;
  let checked = 0;
  for (const record of records) {
    if (Date.now() > deadline) break;
    checked++;
    if (dryRun) { deleted++; continue; }
    await deleteReviewPhotosFromR2([record.url], record.userId);
    const latest = await prisma.reviewPhotoUpload.findUnique({ where: { id: record.id }, select: { status: true } });
    if (latest?.status === 'DELETED') deleted++;
    else if (latest?.status === 'DELETING') failed++;
  }
  return { checked, deleted, failed };
}
