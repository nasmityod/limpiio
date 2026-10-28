import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { bannerSchema, bannerToggleSchema } from '@/lib/editorial-schemas';
import { prisma } from '@/lib/prisma';
import { claimEditorialAssets } from '@/lib/products/product-asset-references';
import { requirePermission } from '@/lib/admin-access-server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rejectInvalidMutationOrigin } from '@/lib/security';

/**
 * Tipos de banner válidos según la UI del panel admin.
 * Actualizar aquí si se añaden nuevos tipos en el futuro.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requirePermission('SITE_CONTENT');

  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) {
    return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  }

  // Público: solo banners activos (evita fuga si se adivina el id de un banner inactivo).
  // Admin puede ver cualquier registro para el panel / previas.
  if (!banner.active && !auth.authorized) {
    return NextResponse.json({ error: 'No encontrado.' }, { status: 404 });
  }

  return NextResponse.json(banner);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('SITE_CONTENT');
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bannerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos del banner inválidos.', errors: parsed.error.flatten() },
      { status: 422 }
    );
  }

  try {
    const banner = await prisma.$transaction(async (tx) => {
      await claimEditorialAssets(tx, parsed.data.imageUrl);
      return tx.banner.update({
      where: { id },
      data:  parsed.data,
    });
    });
    revalidatePath('/');
    revalidateTag('banners', 'default');
    return NextResponse.json(banner);
  } catch (error) {
    logError('banners_put_failed', error, { route: '/api/banners/[id]' });
    return NextResponse.json({ error: 'Error al actualizar el banner.' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(_req);
  if (originCheck) return originCheck;

  const auth = await requirePermission('SITE_CONTENT');
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    await prisma.banner.delete({ where: { id } });
    revalidatePath('/');
    revalidateTag('banners', 'default');
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('banners_delete_failed', error, { route: '/api/banners/[id]' });
    return NextResponse.json({ error: 'Error al eliminar el banner.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;
  const auth = await requirePermission('SITE_CONTENT');
  if (!auth.authorized) return auth.response;
  const parsed = bannerToggleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
  try {
    const { id } = await params;
    const banner = await prisma.banner.update({ where: { id }, data: parsed.data });
    revalidatePath('/');
    revalidateTag('banners', 'default');
    return NextResponse.json(banner);
  } catch (error) {
    logError('banners_patch_failed', error, { route: '/api/banners/[id]' });
    return NextResponse.json({ error: 'No se pudo cambiar el estado.' }, { status: 500 });
  }
}
