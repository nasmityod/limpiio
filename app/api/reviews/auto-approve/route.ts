import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { readReviewsAutoApprove, writeReviewsAutoApprove } from '@/lib/reviews';

/** PRD-229: rastro de auditoría del último cambio (AppConfig, sin tocar schema). */
const AUTO_APPROVE_AUDIT_KEY = 'reviews_auto_approve_audit';

/** GET /api/reviews/auto-approve — estado actual de auto-aprobación (admin). */
export async function GET() {
  const auth = await requirePermission('REVIEWS');
  if (!auth.authorized) return auth.response;
  const autoApprove = await readReviewsAutoApprove();
  return NextResponse.json({ autoApprove }, { headers: { 'Cache-Control': 'no-store' } });
}

const schema = z.object({ autoApprove: z.boolean() });

/** PUT /api/reviews/auto-approve — activa/desactiva auto-aprobación (admin). */
export async function PUT(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('REVIEWS');
  if (!auth.authorized) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  try {
    await writeReviewsAutoApprove(parsed.data.autoApprove);

    // PRD-229: cambio crítico de moderación con trazabilidad — quién, cuándo y a qué valor
    const audit = {
      autoApprove: parsed.data.autoApprove,
      changedBy:   auth.session.user?.email ?? auth.session.user?.id ?? 'desconocido',
      changedAt:   new Date().toISOString(),
    };
    console.info(
      '[reviews/auto-approve] cambiado a %s por %s (%s)',
      audit.autoApprove ? 'ON' : 'OFF',
      audit.changedBy,
      audit.changedAt,
    );
    await prisma.appConfig.upsert({
      where:  { key: AUTO_APPROVE_AUDIT_KEY },
      update: { value: JSON.stringify(audit) },
      create: { key: AUTO_APPROVE_AUDIT_KEY, value: JSON.stringify(audit) },
    });

    return NextResponse.json({ autoApprove: parsed.data.autoApprove });
  } catch (error) {
    logError('reviews_auto_approve_failed', error, { route: '/api/reviews/auto-approve' });
    return NextResponse.json({ error: 'No se pudo actualizar la configuración.' }, { status: 500 });
  }
}
