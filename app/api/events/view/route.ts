import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { z } from 'zod';

// PRD-183: sessionId con formato estricto (cuid/uuid/nanoid o el `${Date.now()}-${rand36}`
// del tracker propio). Nada de strings basura arbitrarios en BD.
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const viewSchema = z.object({
  productId: z.string().min(1).max(64),
  sessionId: z.string().regex(SESSION_ID_RE, 'sessionId inválido').optional(),
});

/** Ventana de deduplicación por (sessionId, productId). */
const DEDUP_WINDOW_MS = 30 * 60_000;

/** Índice de ventana temporal para dedup idempotente vía @@unique en BD. */
function viewBucketFor(nowMs = Date.now()): string {
  return String(Math.floor(nowMs / DEDUP_WINDOW_MS));
}

/**
 * POST /api/events/view
 * Body: { productId: string; sessionId?: string }
 * Registra una vista de producto en la tabla ProductView.
 * Fire-and-forget desde el cliente — no bloquea la navegación.
 *
 * PRD-182: dedup en BD por (sessionId, productId, viewBucket) con índice único
 * — idempotente bajo concurrencia — y solo se registran vistas con sessionId válido.
 */
export async function POST(request: Request) {
  try {
    const originCheck = rejectInvalidMutationOrigin(request);
    if (originCheck) return originCheck;

    const ip = getClientIp(request);

    // Rate limit global por IP: máx 60 eventos de vista por minuto.
    const globalLimited = await rateLimit(`events:view:global:${ip}`, { limit: 60, windowMs: 60_000 });
    if (globalLimited) {
      return NextResponse.json({ ok: false }, { status: 200 }); // silencioso para el cliente
    }

    const parsed = viewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'payload inválido' }, { status: 400 });
    }
    const { productId, sessionId } = parsed.data;

    // PRD-182: sin sessionId no se registra (los bots sin estado no inflan el
    // ranking). Respuesta silenciosa para no romper clientes sin storage.
    if (!sessionId) {
      return NextResponse.json({ ok: true });
    }

    // Rate limit por (IP, productId): máx 1 vista registrada cada 30 minutos por producto.
    const productLimited = await rateLimit(`events:view:${ip}:${productId}`, { limit: 1, windowMs: DEDUP_WINDOW_MS });
    if (productLimited) {
      return NextResponse.json({ ok: true }); // ya registrada recientemente, respuesta silenciosa
    }

    // Verificar que el producto existe antes de registrar
    const exists = await prisma.product.findUnique({
      where:  { id: productId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ ok: false }, { status: 200 }); // silencioso
    }

    // Dedup fuerte: @@unique(sessionId, productId, viewBucket) + skipDuplicates
    // resuelve carreras concurrentes en la misma ventana sin read-then-write.
    await prisma.productView.createMany({
      data: [{ productId, sessionId, viewBucket: viewBucketFor() }],
      skipDuplicates: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError('events_view_failed', err, { route: '/api/events/view' });
    return NextResponse.json({ ok: false }, { status: 200 }); // no romper al cliente
  }
}
