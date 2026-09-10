/**
 * Convierte un nombre de producto en un slug SEO-friendly.
 * Ej: "Consola R36s Pro" → "consola-r36s-pro"
 *     "Nevera Hyundai 300L" → "nevera-hyundai-300l"
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')                        // descompone caracteres con tilde
    .replace(/[\u0300-\u036f]/g, '')         // elimina los diacríticos (tildes, etc.)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')           // elimina caracteres especiales
    .replace(/[\s_]+/g, '-')                // reemplaza espacios/guiones_bajos por -
    .replace(/-{2,}/g, '-')                 // colapsa múltiples guiones
    .replace(/^-+|-+$/g, '');              // elimina guiones al inicio/fin
}

/**
 * Genera un slug único para un producto verificando duplicados en BD.
 * Si "nevera-hyundai" ya existe, prueba "nevera-hyundai-2", "-3", etc.
 */
export async function generateUniqueSlug(
  name: string,
  existingSlugs: Set<string>,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name);
  if (!base) return `producto-${Date.now()}`;

  let candidate = base;
  let counter   = 2;

  // La función recibe el Set de slugs existentes para evitar un bucle de queries
  while (existingSlugs.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter++;
  }

  return candidate;
}
