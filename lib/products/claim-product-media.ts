import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export function deletedProductAssetKey(url: string) {
  return `deleted_product_asset:${createHash('sha256').update(url).digest('hex')}`;
}

type Slot = { type: 'IMAGE' | 'VIDEO'; url: string; posterUrl?: string };

/** Same advisory locks as video deletion: a deleted temporary upload cannot be
 * linked while a DELETE is in flight. Sort locks to avoid cross-gallery deadlocks. */
export async function claimProductMedia(tx: Prisma.TransactionClient, slots: Slot[], productId?: string) {
  const urls = [...new Set(slots.flatMap((s) => [s.url, ...(s.posterUrl ? [s.posterUrl] : [])]))].sort();
  for (const url of urls) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${url}, 0))`;
  const deleted = await tx.appConfig.findFirst({
    where: { key: { in: urls.map(deletedProductAssetKey) } }, select: { key: true },
  });
  if (deleted) throw new Error('Una imagen o video fue eliminado. Vuelve a subir el archivo antes de guardar.');
  for (const slot of slots) {
    if (slot.type !== 'VIDEO') continue;
    const job = await tx.videoJob.findFirst({ where: { videoUrl: slot.url } });
    if (job?.status === 'READY') {
      if ((slot.posterUrl ?? null) !== job.posterUrl) throw new Error('El póster del video no coincide con la subida.');
      continue;
    }
    // Existing legacy videos may predate VideoJob, but never reuse a deleted job.
    const legacy = !job && productId && await tx.productMedia.findFirst({
      where: { productId, type: 'VIDEO', url: slot.url, posterUrl: slot.posterUrl ?? null }, select: { id: true },
    });
    if (!legacy) throw new Error('El video aún no está listo o ya fue eliminado. Vuelve a subirlo.');
  }
}
