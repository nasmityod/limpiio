import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { promotionSchema } from '@/lib/editorial-schemas';
import { prisma } from '@/lib/prisma';
import { claimEditorialAssets } from '@/lib/products/product-asset-references';
import { requirePermission } from '@/lib/admin-access-server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rejectInvalidMutationOrigin } from '@/lib/security';

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
    const { link, ...data } = parsed.data;
    const promo = await prisma.$transaction(async (tx) => {
      await claimEditorialAssets(tx, parsed.data.imageUrl);
      return tx.promotion.update({
      where: { id },
      data: { ...data, ...(link !== undefined ? { link: link ?? '/productos' } : {}) },
    });
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
