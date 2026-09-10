import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { isSafeEditableLink } from '@/lib/safe-link';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rejectInvalidMutationOrigin } from '@/lib/security';

const promotionSchema = z.object({
  title:        z.string().min(1, 'El título es obligatorio.').max(200),
  subtitle:     z.string().max(300).optional().nullable(),
  discountText: z.string().max(100).optional().nullable(),
  imageUrl:     z.string().url('URL de imagen inválida.').max(500).optional().nullable(),
  bgColor:      z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color HEX inválido.')
    .optional()
    .default('#FFD700'),
  // PRD-042/283: solo rutas internas (/...) o https — sin javascript:/data:.
  link:   z
    .string()
    .max(500)
    .refine((v) => isSafeEditableLink(v), 'Enlace no permitido: usa ruta interna (/...) o https.')
    .optional()
    .default('/productos'),
  active: z.boolean().optional().default(true),
  order:  z.number({ message: 'El orden debe ser un número.' }).int().min(0).max(9999).optional().default(1),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('PROMOTIONS');
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = promotionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos de la promoción inválidos.', errors: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    const promo = await prisma.promotion.update({
      where: { id },
      data:  parsed.data,
    });
    revalidatePath('/');
    revalidateTag('promotions', 'default');
    return NextResponse.json(promo);
  } catch (error) {
    logError('promotions_put_failed', error, { route: '/api/promotions/[id]' });
    return NextResponse.json({ error: 'Error al actualizar la promoción.' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(_req);
  if (originCheck) return originCheck;

  const auth = await requirePermission('PROMOTIONS');
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    await prisma.promotion.delete({ where: { id } });
    revalidatePath('/');
    revalidateTag('promotions', 'default');
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('promotions_delete_failed', error, { route: '/api/promotions/[id]' });
    return NextResponse.json({ error: 'Error al eliminar la promoción.' }, { status: 500 });
  }
}
