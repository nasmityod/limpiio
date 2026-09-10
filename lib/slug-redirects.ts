/**
 * slug-redirects.ts (PRD-066)
 * Persistencia de redirecciones 301 cuando un producto cambia de slug.
 * Se guarda en AppConfig (`slug_redirect:<slug-viejo>` → `<slug-nuevo>`) para
 * no tocar `schema.prisma` (propiedad de 03-INFRA). La ficha de producto
 * consulta `resolveSlugRedirect()` antes de responder 404.
 */
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/safe-logger';

const SLUG_REDIRECT_PREFIX = 'slug_redirect:';

/**
 * Registra `oldSlug → newSlug` y mantiene la tabla sin cadenas ni ciclos:
 * - Redirects que apuntaban a `oldSlug` pasan a apuntar a `newSlug` (sin saltos dobles).
 * - Se elimina cualquier redirect cuyo origen sea el slug ahora vigente (evita ciclos A→B→A).
 */
export async function saveSlugRedirect(oldSlug: string, newSlug: string): Promise<void> {
  const from = oldSlug.trim();
  const to = newSlug.trim();
  if (!from || !to || from === to) return;

  try {
    await prisma.$transaction([
      // Aplana cadenas: X→oldSlug se convierte en X→newSlug
      prisma.appConfig.updateMany({
        where: { key: { startsWith: SLUG_REDIRECT_PREFIX }, value: from },
        data: { value: to },
      }),
      // Evita ciclos: si existía newSlug→algo, ese origen vuelve a estar vivo
      prisma.appConfig.deleteMany({ where: { key: `${SLUG_REDIRECT_PREFIX}${to}` } }),
      prisma.appConfig.upsert({
        where: { key: `${SLUG_REDIRECT_PREFIX}${from}` },
        update: { value: to },
        create: { key: `${SLUG_REDIRECT_PREFIX}${from}`, value: to },
      }),
    ]);
  } catch (error) {
    // Best-effort: el rename del producto ya se aplicó; un redirect fallido no debe romper el guardado
    logError('slug_redirect_save_failed', error, { operation: 'save_slug_redirect' });
  }
}

/** Devuelve el slug vigente para un slug renombrado, o null si no hay redirect. */
export async function resolveSlugRedirect(slug: string): Promise<string | null> {
  const s = slug.trim();
  if (!s) return null;
  try {
    const rec = await prisma.appConfig.findUnique({
      where: { key: `${SLUG_REDIRECT_PREFIX}${s}` },
      select: { value: true },
    });
    return rec?.value && rec.value !== s ? rec.value : null;
  } catch (error) {
    logError('slug_redirect_resolve_failed', error, { operation: 'resolve_slug_redirect' });
    return null;
  }
}
