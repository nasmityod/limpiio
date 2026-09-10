/**
 * migrate-legacy-images-to-r2.ts
 *
 * Copia imágenes legacy del CDN anterior a R2 y actualiza la BD.
 * Requiere LEGACY_IMAGE_CDN_HOST en .env.local (hostname del CDN de origen).
 * Idempotente: omite URLs que ya apuntan a R2_PUBLIC_BASE_URL.
 * NO borra objetos en el CDN de origen.
 *
 * Uso:
 *   npx tsx scripts/migrate-legacy-images-to-r2.ts --dry-run
 *   npx tsx scripts/migrate-legacy-images-to-r2.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { detectImageMimeFromBuffer } from '../lib/detect-image-mime';
import { processImageForMigration } from '../lib/image-processing';
import { buildKey, uploadToR2, type R2Folder } from '../lib/r2';
import { SITE_CONTENT_KEY } from '../lib/site-content-schema';

dotenv.config({ path: '.env.local' });
dotenv.config();

function readLegacyCdnHost(): string {
  const host = process.env.LEGACY_IMAGE_CDN_HOST?.trim();
  if (!host) {
    throw new Error(
      '[migrate] LEGACY_IMAGE_CDN_HOST no está configurada. ' +
        'Define el hostname del CDN legacy en .env.local antes de ejecutar la migración.',
    );
  }
  return host;
}

const LEGACY_CDN_HOST = readLegacyCdnHost();
const dryRun = process.argv.includes('--dry-run');

function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/^prisma\+/, '');
}

function r2PublicBase(): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  return base || null;
}

function requireR2PublicBase(): string {
  const base = r2PublicBase();
  if (!base) {
    throw new Error(
      '[migrate] R2_PUBLIC_BASE_URL no está configurada. ' +
        'Habilítala en Cloudflare (R2 → bucket → Public Development URL) y pégala en .env.local.',
    );
  }
  return base;
}

function isAlreadyOnR2(url: string): boolean {
  const base = r2PublicBase();
  if (!base) return false;
  return url.startsWith(`${base}/`);
}

function isLegacyCdnUrl(url: string | null | undefined): url is string {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === LEGACY_CDN_HOST;
  } catch {
    return false;
  }
}

interface MigrateTask {
  label: string;
  url: string;
  folder: R2Folder;
  maxWidth: number;
  apply: (newUrl: string) => Promise<void>;
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al descargar ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function migrateUrl(
  task: MigrateTask,
): Promise<'skipped' | 'migrated' | 'failed'> {
  const { label, url, folder, maxWidth, apply } = task;

  if (!isLegacyCdnUrl(url)) {
    if (isAlreadyOnR2(url)) {
      console.log(`[skip] ${label} — ya en R2`);
      return 'skipped';
    }
    console.log(`[skip] ${label} — no es CDN legacy: ${url}`);
    return 'skipped';
  }

  if (dryRun) {
    console.log(`[dry-run] ${label} — migraría ${url} → R2/${folder}/ (maxWidth ${maxWidth})`);
    return 'migrated';
  }

  try {
    const raw = await downloadImage(url);
    const mime = detectImageMimeFromBuffer(raw);
    if (!mime) {
      throw new Error('Magic bytes no reconocidos');
    }

    const processed = await processImageForMigration(raw, mime, maxWidth);
    const key = buildKey(folder, processed.ext);
    const newUrl = await uploadToR2({
      buffer: processed.buffer,
      key,
      contentType: processed.contentType,
    });

    await apply(newUrl);
    console.log(`[ok] ${label} — ${url} → ${newUrl}`);
    return 'migrated';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[error] ${label} — ${url}: ${msg}`);
    return 'failed';
  }
}

async function main() {
  console.log(`[migrate] Modo: ${dryRun ? 'DRY-RUN' : 'REAL'}`);
  if (dryRun) {
    if (!r2PublicBase()) {
      console.warn(
        '[migrate] R2_PUBLIC_BASE_URL vacía — dry-run OK para inventariar URLs legacy; ' +
          'configúrala antes de la migración real.',
      );
    }
  } else {
    requireR2PublicBase();
  }

  const pool = new Pool({ connectionString: normalizeUrl(process.env.DATABASE_URL) });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const stats = { migrated: 0, skipped: 0, failed: 0 };

  const bump = (result: 'skipped' | 'migrated' | 'failed') => {
    stats[result === 'migrated' ? 'migrated' : result === 'skipped' ? 'skipped' : 'failed'] += 1;
  };

  // ── Product.images ────────────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    select: { id: true, name: true, images: true },
  });
  for (const p of products) {
    const nextImages = [...p.images];
    let changed = false;
    for (let i = 0; i < p.images.length; i++) {
      const url = p.images[i];
      if (!isLegacyCdnUrl(url)) continue;
      const result = await migrateUrl({
        label: `Product ${p.id} images[${i}] (${p.name})`,
        url,
        folder: 'products',
        maxWidth: 1200,
        apply: async (newUrl) => {
          nextImages[i] = newUrl;
          changed = true;
        },
      });
      bump(result);
    }
    if (!dryRun && changed) {
      await prisma.product.update({
        where: { id: p.id },
        data: { images: nextImages },
        select: { id: true },
      });
    }
  }

  // ── ProductMedia ──────────────────────────────────────────────────────────
  const media = await prisma.productMedia.findMany({
    select: { id: true, url: true, posterUrl: true, productId: true },
  });
  for (const m of media) {
    if (isLegacyCdnUrl(m.url)) {
      let newUrl = m.url;
      const result = await migrateUrl({
        label: `ProductMedia ${m.id} url`,
        url: m.url,
        folder: 'products',
        maxWidth: 1200,
        apply: async (u) => {
          newUrl = u;
        },
      });
      bump(result);
      if (!dryRun && result === 'migrated' && newUrl !== m.url) {
        await prisma.productMedia.update({
          where: { id: m.id },
          data: { url: newUrl },
          select: { id: true },
        });
      }
    }
    if (isLegacyCdnUrl(m.posterUrl)) {
      let newPoster = m.posterUrl!;
      const result = await migrateUrl({
        label: `ProductMedia ${m.id} posterUrl`,
        url: m.posterUrl!,
        folder: 'products',
        maxWidth: 1200,
        apply: async (u) => {
          newPoster = u;
        },
      });
      bump(result);
      if (!dryRun && result === 'migrated' && newPoster !== m.posterUrl) {
        await prisma.productMedia.update({
          where: { id: m.id },
          data: { posterUrl: newPoster },
          select: { id: true },
        });
      }
    }
  }

  // ── Category ──────────────────────────────────────────────────────────────
  const categories = await prisma.category.findMany({ select: { id: true, name: true, imageUrl: true } });
  for (const c of categories) {
    if (!isLegacyCdnUrl(c.imageUrl)) continue;
    let newUrl = c.imageUrl!;
    const result = await migrateUrl({
      label: `Category ${c.id} (${c.name})`,
      url: c.imageUrl!,
      folder: 'assets',
      maxWidth: 1920,
      apply: async (u) => {
        newUrl = u;
      },
    });
    bump(result);
    if (!dryRun && result === 'migrated') {
      await prisma.category.update({
        where: { id: c.id },
        data: { imageUrl: newUrl },
        select: { id: true },
      });
    }
  }

  // ── Promotion ─────────────────────────────────────────────────────────────
  const promotions = await prisma.promotion.findMany({ select: { id: true, title: true, imageUrl: true } });
  for (const p of promotions) {
    if (!isLegacyCdnUrl(p.imageUrl)) continue;
    let newUrl = p.imageUrl!;
    const result = await migrateUrl({
      label: `Promotion ${p.id} (${p.title})`,
      url: p.imageUrl!,
      folder: 'banners',
      maxWidth: 1920,
      apply: async (u) => {
        newUrl = u;
      },
    });
    bump(result);
    if (!dryRun && result === 'migrated') {
      await prisma.promotion.update({
        where: { id: p.id },
        data: { imageUrl: newUrl },
        select: { id: true },
      });
    }
  }

  // ── Banner ────────────────────────────────────────────────────────────────
  const banners = await prisma.banner.findMany({ select: { id: true, type: true, imageUrl: true } });
  for (const b of banners) {
    if (!isLegacyCdnUrl(b.imageUrl)) continue;
    let newUrl = b.imageUrl;
    const result = await migrateUrl({
      label: `Banner ${b.id} (${b.type})`,
      url: b.imageUrl,
      folder: 'banners',
      maxWidth: 1920,
      apply: async (u) => {
        newUrl = u;
      },
    });
    bump(result);
    if (!dryRun && result === 'migrated') {
      await prisma.banner.update({
        where: { id: b.id },
        data: { imageUrl: newUrl },
        select: { id: true },
      });
    }
  }

  // ── Order (comprobantes + tracking) ───────────────────────────────────────
  const orders = await prisma.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      paymentProofUrl: true,
      trackingPhotoUrl: true,
    },
  });
  for (const o of orders) {
    if (isLegacyCdnUrl(o.paymentProofUrl)) {
      let newUrl = o.paymentProofUrl!;
      const result = await migrateUrl({
        label: `Order ${o.orderNumber} paymentProofUrl`,
        url: o.paymentProofUrl!,
        folder: 'proofs',
        maxWidth: 1600,
        apply: async (u) => {
          newUrl = u;
        },
      });
      bump(result);
      if (!dryRun && result === 'migrated') {
        await prisma.order.update({
          where: { id: o.id },
          data: { paymentProofUrl: newUrl },
          select: { id: true },
        });
      }
    }
    if (isLegacyCdnUrl(o.trackingPhotoUrl)) {
      let newUrl = o.trackingPhotoUrl!;
      const result = await migrateUrl({
        label: `Order ${o.orderNumber} trackingPhotoUrl`,
        url: o.trackingPhotoUrl!,
        folder: 'assets',
        maxWidth: 1600,
        apply: async (u) => {
          newUrl = u;
        },
      });
      bump(result);
      if (!dryRun && result === 'migrated') {
        await prisma.order.update({
          where: { id: o.id },
          data: { trackingPhotoUrl: newUrl },
          select: { id: true },
        });
      }
    }
  }

  // ── Site content (AppConfig JSON) ─────────────────────────────────────────
  const siteRec = await prisma.appConfig.findUnique({ where: { key: SITE_CONTENT_KEY } });
  if (siteRec) {
    try {
      const content = JSON.parse(siteRec.value) as {
        heroFallback?: { imageUrl?: string };
        popup?: { imageUrl?: string };
      };
      let jsonChanged = false;

      for (const [field, ref] of [
        ['heroFallback.imageUrl', content.heroFallback?.imageUrl] as const,
        ['popup.imageUrl', content.popup?.imageUrl] as const,
      ]) {
        const url = ref;
        if (!isLegacyCdnUrl(url)) continue;
        const result = await migrateUrl({
          label: `SiteContent ${field}`,
          url,
          folder: 'banners',
          maxWidth: 1920,
          apply: async (newUrl) => {
            if (field === 'heroFallback.imageUrl' && content.heroFallback) {
              content.heroFallback.imageUrl = newUrl;
              jsonChanged = true;
            }
            if (field === 'popup.imageUrl' && content.popup) {
              content.popup.imageUrl = newUrl;
              jsonChanged = true;
            }
          },
        });
        bump(result);
      }

      if (!dryRun && jsonChanged) {
        await prisma.appConfig.update({
          where: { key: SITE_CONTENT_KEY },
          data: { value: JSON.stringify(content) },
          select: { id: true },
        });
      }
    } catch (err) {
      console.error('[error] SiteContent JSON:', err);
      stats.failed += 1;
    }
  }

  console.log('\n[migrate] Resumen:', stats);
  await prisma.$disconnect();
  await pool.end();

  if (stats.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[migrate] Fatal:', err);
  process.exit(1);
});
