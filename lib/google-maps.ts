/**
 * URLs de Google Maps para MundoTech (Barquisimeto).
 *
 * En producción conviene configurar NEXT_PUBLIC_GOOGLE_MAPS_BUSINESS_URL con el vínculo
 * de la ficha del negocio: abre Maps → busca tu tienda verificada → Compartir → Copiar vínculo.
 * Así la app/Google Maps muestra nombre, fotos y reseñas, no solo un PIN genérico.
 *
 * NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL: mismo flujo pero “Insertar un mapa” y pega solo el src del iframe.
 */

export const GOOGLE_MAPS_LOCATION_QUERY =
  'Mundo Tech, Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001, Lara, Venezuela';

export function googleMapsBusinessUrl(query?: string): string {
  const custom = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BUSINESS_URL?.trim();
  if (custom) return custom;
  const q = query?.trim() || GOOGLE_MAPS_LOCATION_QUERY;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Mapa incrustado: por defecto búsqueda por dirección/nombre (sin API key). */
export function googleMapsEmbedUrl(query?: string): string {
  const custom = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL?.trim();
  if (custom) return custom;
  const q = encodeURIComponent(query?.trim() || GOOGLE_MAPS_LOCATION_QUERY);
  return `https://maps.google.com/maps?q=${q}&z=18&hl=es&output=embed`;
}
