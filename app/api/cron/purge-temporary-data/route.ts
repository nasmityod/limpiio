import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerSecret } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export const dynamic = 'force-dynamic';

const BATCH_LIMIT = 200;
const PRODUCT_VIEW_RETENTION_DAYS = 90;
const ABANDONED_CART_PENDING_RETENTION_DAYS = 90;
const ABANDONED_CART_TERMINAL_RETENTION_DAYS = 365;

/** Clave de AppConfig para la última ejecución exitosa. */
const LAST_SUCCESS_KEY = 'purge_temp_data_last_success_at';

// ─────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return verifyBearerSecret(req, cronSecret);
}

// ─────────────────────────────────────────────────────────────
// Helpers de retención
// ─────────────────────────────────────────────────────────────

function getTempTokenRetentionDays(): number | null {
  const raw = process.env.TEMP_TOKEN_RETENTION_DAYS?.trim();
  if (!raw) {
    if (process.env.NODE_ENV !== 'production') return 7; // default dev
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) return null;
  return parsed;
}

function getDeletedUploadRetentionDays(): number | null {
  const raw = process.env.DELETED_UPLOAD_RETENTION_DAYS?.trim();
  if (!raw) {
    if (process.env.NODE_ENV !== 'production') return 30; // default dev
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) return null;
  return parsed;
}

// ─────────────────────────────────────────────────────────────
// Categorías de purga
// ─────────────────────────────────────────────────────────────

interface CategoryResult {
  deleted: number;
  checked: number;
  skippedReason?: string;
}

interface PurgeResult {
  ok: true;
  dryRun: boolean;
  durationMs: number;
  categories: {
    passwordResetTokens: CategoryResult;
    emailChangeTokens: CategoryResult;
    deletedUploads: CategoryResult;
    productViews: CategoryResult;
    abandonedCartsPending: CategoryResult;
    abandonedCartsTerminal: CategoryResult;
  };
}

/**
 * SESIÓN 07 — Purga unificada de datos temporales.
 *
 * Categorías:
 *   1. PasswordResetToken expirados > TEMP_TOKEN_RETENTION_DAYS.
 *   2. User.emailChangeToken expirados > TEMP_TOKEN_RETENTION_DAYS (limpia campos).
 *   3. PaymentUpload DELETED con updatedAt > DELETED_UPLOAD_RETENTION_DAYS.
 *   4. ProductView con createdAt > 90 días.
 *   5. AbandonedCart PENDING/EMAILED con lastActivityAt > 90 días.
 *   6. AbandonedCart RECOVERED/OPTED_OUT con updatedAt > 365 días.
 *
 * NO borra: Order, OrderItem, CouponRedemption, PaymentUpload LINKED.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  const startMs = Date.now();

  // ── Leer variables de retención ──────────────────────────
  const tokenRetentionDays = getTempTokenRetentionDays();
  const deletedUploadDays = getDeletedUploadRetentionDays();

  // ── Calcular cutoffs ─────────────────────────────────────
  const now = new Date();

  const tokenCutoff = tokenRetentionDays
    ? new Date(now.getTime() - tokenRetentionDays * 24 * 60 * 60 * 1000)
    : null;

  const deletedUploadCutoff = deletedUploadDays
    ? new Date(now.getTime() - deletedUploadDays * 24 * 60 * 60 * 1000)
    : null;

  const productViewCutoff = new Date(
    now.getTime() - PRODUCT_VIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const abandonedCartPendingCutoff = new Date(
    now.getTime() - ABANDONED_CART_PENDING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const abandonedCartTerminalCutoff = new Date(
    now.getTime() - ABANDONED_CART_TERMINAL_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const passwordResetTokens: CategoryResult = { deleted: 0, checked: 0 };
  const emailChangeTokens: CategoryResult = { deleted: 0, checked: 0 };
  const deletedUploads: CategoryResult = { deleted: 0, checked: 0 };
  const productViews: CategoryResult = { deleted: 0, checked: 0 };
  const abandonedCartsPending: CategoryResult = { deleted: 0, checked: 0 };
  const abandonedCartsTerminal: CategoryResult = { deleted: 0, checked: 0 };

  try {
    // ── 1. PasswordResetToken ──────────────────────────────
    if (tokenCutoff) {
      const where = { expiresAt: { lt: tokenCutoff } };
      const count = await prisma.passwordResetToken.count({ where });
      passwordResetTokens.checked = count;

      if (count > 0 && !dryRun) {
        const toDelete = Math.min(count, BATCH_LIMIT);
        // select IDs first, then delete by IDs (no sub-select batch possible with findMany)
        const records = await prisma.passwordResetToken.findMany({
          where,
          take: toDelete,
          orderBy: { expiresAt: 'asc' },
          select: { id: true },
        });
        if (records.length > 0) {
          const { count: deleted } = await prisma.passwordResetToken.deleteMany({
            where: { id: { in: records.map((r) => r.id) } },
          });
          passwordResetTokens.deleted = deleted;
        }
      } else if (dryRun) {
        passwordResetTokens.deleted = Math.min(count, BATCH_LIMIT);
      }
    } else {
      passwordResetTokens.skippedReason = 'TEMP_TOKEN_RETENTION_DAYS not configured';
    }

    // ── 2. User emailChangeToken ───────────────────────────
    if (tokenCutoff) {
      const where = {
        emailChangeToken: { not: null },
        emailChangeTokenExpiry: { lt: tokenCutoff },
      };
      const count = await prisma.user.count({ where });
      emailChangeTokens.checked = count;

      if (count > 0 && !dryRun) {
        const records = await prisma.user.findMany({
          where,
          take: BATCH_LIMIT,
          orderBy: { emailChangeTokenExpiry: 'asc' },
          select: { id: true },
        });
        if (records.length > 0) {
          const { count: cleared } = await prisma.user.updateMany({
            where: { id: { in: records.map((r) => r.id) } },
            data: {
              emailChangeToken: null,
              emailChangeTokenExpiry: null,
              pendingEmail: null,
            },
          });
          emailChangeTokens.deleted = cleared;
        }
      } else if (dryRun) {
        emailChangeTokens.deleted = Math.min(count, BATCH_LIMIT);
      }
    } else {
      emailChangeTokens.skippedReason = 'TEMP_TOKEN_RETENTION_DAYS not configured';
    }

    // ── 3. PaymentUpload DELETED ───────────────────────────
    if (deletedUploadCutoff) {
      const where = {
        status: 'DELETED' as const,
        updatedAt: { lt: deletedUploadCutoff },
      };
      const count = await prisma.paymentUpload.count({ where });
      deletedUploads.checked = count;

      if (count > 0 && !dryRun) {
        const records = await prisma.paymentUpload.findMany({
          where,
          take: BATCH_LIMIT,
          orderBy: { updatedAt: 'asc' },
          select: { id: true },
        });
        if (records.length > 0) {
          const { count: deleted } = await prisma.paymentUpload.deleteMany({
            where: { id: { in: records.map((r) => r.id) } },
          });
          deletedUploads.deleted = deleted;
        }
      } else if (dryRun) {
        deletedUploads.deleted = Math.min(count, BATCH_LIMIT);
      }
    } else {
      deletedUploads.skippedReason = 'DELETED_UPLOAD_RETENTION_DAYS not configured';
    }

    // ── 4. ProductView ─────────────────────────────────────
    {
      const where = { createdAt: { lt: productViewCutoff } };
      const count = await prisma.productView.count({ where });
      productViews.checked = count;

      if (count > 0 && !dryRun) {
        const toDelete = Math.min(count, BATCH_LIMIT);
        const records = await prisma.productView.findMany({
          where,
          take: toDelete,
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (records.length > 0) {
          const { count: deleted } = await prisma.productView.deleteMany({
            where: { id: { in: records.map((r) => r.id) } },
          });
          productViews.deleted = deleted;
        }
      } else if (dryRun) {
        productViews.deleted = Math.min(count, BATCH_LIMIT);
      }
    }

    // ── 5. AbandonedCart PENDING / EMAILED ─────────────────
    {
      const where = {
        status: { in: ['PENDING', 'EMAILED_24H', 'EMAILED_72H'] },
        lastActivityAt: { lt: abandonedCartPendingCutoff },
      };
      const count = await prisma.abandonedCart.count({ where });
      abandonedCartsPending.checked = count;

      if (count > 0 && !dryRun) {
        const records = await prisma.abandonedCart.findMany({
          where,
          take: BATCH_LIMIT,
          orderBy: { lastActivityAt: 'asc' },
          select: { id: true },
        });
        if (records.length > 0) {
          const { count: deleted } = await prisma.abandonedCart.deleteMany({
            where: { id: { in: records.map((r) => r.id) } },
          });
          abandonedCartsPending.deleted = deleted;
        }
      } else if (dryRun) {
        abandonedCartsPending.deleted = Math.min(count, BATCH_LIMIT);
      }
    }

    // ── 6. AbandonedCart RECOVERED / OPTED_OUT ─────────────
    {
      const where = {
        status: { in: ['RECOVERED', 'OPTED_OUT'] },
        updatedAt: { lt: abandonedCartTerminalCutoff },
      };
      const count = await prisma.abandonedCart.count({ where });
      abandonedCartsTerminal.checked = count;

      if (count > 0 && !dryRun) {
        const records = await prisma.abandonedCart.findMany({
          where,
          take: BATCH_LIMIT,
          orderBy: { updatedAt: 'asc' },
          select: { id: true },
        });
        if (records.length > 0) {
          const { count: deleted } = await prisma.abandonedCart.deleteMany({
            where: { id: { in: records.map((r) => r.id) } },
          });
          abandonedCartsTerminal.deleted = deleted;
        }
      } else if (dryRun) {
        abandonedCartsTerminal.deleted = Math.min(count, BATCH_LIMIT);
      }
    }

    // ── Registrar última ejecución ─────────────────────────
    if (!dryRun) {
      await prisma.appConfig.upsert({
        where: { key: LAST_SUCCESS_KEY },
        update: { value: new Date().toISOString() },
        create: { key: LAST_SUCCESS_KEY, value: new Date().toISOString() },
      });
    }

    const durationMs = Date.now() - startMs;

    logInfo('cron_purge_temporary_data', {
      operation: 'purge_temporary_data',
      count: passwordResetTokens.deleted + emailChangeTokens.deleted + deletedUploads.deleted + productViews.deleted + abandonedCartsPending.deleted + abandonedCartsTerminal.deleted,
      durationMs,
    });

    const result: PurgeResult = {
      ok: true,
      dryRun,
      durationMs,
      categories: {
        passwordResetTokens,
        emailChangeTokens,
        deletedUploads,
        productViews,
        abandonedCartsPending,
        abandonedCartsTerminal,
      },
    };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    logError('cron_purge_temporary_data_error', err, { operation: 'purge_temporary_data', durationMs });
    return NextResponse.json(
      { error: 'Internal server error', durationMs },
      { status: 500 },
    );
  }
}
