import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { isSafeEditableLink } from '@/lib/safe-link';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rejectInvalidMutationOrigin } from '@/lib/security';

/**
 * Tipos de banner válidos según la UI del panel admin.
 * Actualizar aquí si se añaden nuevos tipos en el futuro.
 */
const BANNER_TYPES = [
  'hero',
  'ad_box',
  'cta_banner',
  'discover',
  'promo_large',
  'promo_small_1',
  'promo_small_2',
] as const;

const FOCAL_POINTS = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

const bannerSchema = z.object({
  type: z.enum(BANNER_TYPES, {
    message: `Tipo inválido. Valores permitidos: ${BANNER_TYPES.join(', ')}.`,
  }),
  imageUrl: z.string().url('URL de imagen inválida.').max(500),
  title:    z.string().max(200).optional().nullable(),
  subtitle: z.string().max(300).optional().nullable(),
  label:    z.string().max(100).optional().nullable(),
  ctaText:  z.string().max(100).optional().nullable(),
  tagText:  z.string().max(100).optional().nullable(),
  // PRD-042/283: solo rutas internas (/...) o https — sin javascript:/data:.
  link:     z
    .string()
    .max(500)
    .refine((v) => isSafeEditableLink(v), 'Enlace no permitido: usa ruta interna (/...) o https.')
    .optional()
    .nullable()
    .default('/productos'),
  focalPoint: z.enum(FOCAL_POINTS).optional().nullable(),
  active:   z.boolean().optional().default(true),
  order:    z.number({ message: 'El orden debe ser un número.' }).int().min(0).max(9999).optional().default(0),
});

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
    const banner = await prisma.banner.update({
      where: { id },
      data:  parsed.data,
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
