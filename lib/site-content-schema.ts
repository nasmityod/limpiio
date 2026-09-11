/**
 * Schema, tipos y defaults PUROS del contenido editable del sitio — sin
 * imports de Prisma, importable desde Client Components (editor del admin,
 * popup). La persistencia (server-only) vive en lib/site-content.ts.
 *
 * Los defaults usan los datos verificados del material físico de la tienda
 * (letrero, tarjetas, marketing) — nunca placeholders. Excepción: el teléfono
 * de WhatsApp sale VACÍO y se rellena en Admin → Personalizar, para que una
 * tienda derivada no arranque enviando clientes al número de otra empresa.
 */
import { z } from 'zod';
import { isInternalEditableLink, isSafeEditableImageUrl } from '@/lib/safe-link';
import { BRAND } from '@/config/brand';

/**
 * Eslogan de la franja de marca. Se recorta a los 60 caracteres que admite el
 * esquema por si la variable de entorno trae un descriptor más largo. La franja
 * se oculta entera cuando queda vacío (HomeHeroCyber comprueba `slogan.trim()`),
 * así que sin eslogan no hay banda vacía bajo el hero.
 */
const BRAND_STRIP_SLOGAN = BRAND.tagline.slice(0, 60);

export const SITE_CONTENT_KEY = 'site_content';

/** PRD-212 / PRD-257: CTAs del hero y del popup solo navegan dentro del sitio. */
const internalCtaLink = (fallback: string) =>
  z
    .string()
    .max(300)
    .refine(isInternalEditableLink, 'El enlace debe ser una ruta interna que empiece por "/".')
    .default(fallback);

/** PRD-259: imagen vacía, ruta interna o URL https válida (no rompe next/image). */
const editableImageUrl = z
  .string()
  .max(500)
  .refine(isSafeEditableImageUrl, 'Usa una URL https válida o deja el campo vacío.')
  .default('');

export const trustIconSchema = z.enum([
  'shield',
  'truck',
  'wallet',
  'store',
  'clock',
  'whatsapp',
  'sparkles',
]);
export type TrustIcon = z.infer<typeof trustIconSchema>;

export const siteContentSchema = z.object({
  /** Slide que muestra el hero cuando el admin no ha creado banners. */
  heroFallback: z.object({
    badge: z.string().max(60).default(''),
    title: z.string().max(90).default(''),
    subtitle: z.string().max(240).default(''),
    ctaText: z.string().max(40).default('Explorar todo el catálogo'),
    ctaLink: internalCtaLink('/productos'),
    imageUrl: editableImageUrl,
  }),
  /** Franja fina bajo el hero con el slogan real — visible siempre. */
  brandStrip: z.object({
    enabled: z.boolean().default(true),
    slogan: z.string().max(60).default(BRAND_STRIP_SLOGAN),
    note: z.string().max(140).default(''),
  }),
  /** Botón flotante de WhatsApp en todas las páginas públicas. Sin teléfono
   *  (default) el FAB, el enlace del pie y la previsualización del admin no se
   *  muestran: `whatsappHref` devuelve null y cada consumidor omite el bloque. */
  whatsapp: z.object({
    enabled: z.boolean().default(true),
    phone: z.string().max(20).default(''),
    message: z.string().max(300).default(''),
  }),
  /** Badges de confianza de la ficha de producto (3 ítems). */
  productTrust: z
    .array(
      z.object({
        icon: trustIconSchema.default('shield'),
        title: z.string().max(60),
        sub: z.string().max(120).default(''),
      }),
    )
    .min(1)
    .max(4),
  /** Popup promocional opcional (apagado por defecto). */
  popup: z.object({
    enabled: z.boolean().default(false),
    badge: z.string().max(40).default(''),
    title: z.string().max(90).default(''),
    text: z.string().max(240).default(''),
    ctaText: z.string().max(40).default(''),
    ctaLink: internalCtaLink('/productos'),
    imageUrl: editableImageUrl,
    /** Días que esperamos antes de volver a mostrarlo tras cerrarse. */
    frequencyDays: z.number().int().min(1).max(90).default(7),
    /** Segundos de navegación antes de aparecer. */
    delaySeconds: z.number().int().min(0).max(120).default(6),
    /** FASE 3: fecha de fin de la promo (YYYY-MM-DD). Vencida = popup oculto.
     *  Vacío = sin fecha de fin (se muestra mientras enabled sea true). */
    endsAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha: AAAA-MM-DD')
      .or(z.literal(''))
      .default(''),
  }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;

export const DEFAULT_SITE_CONTENT: SiteContent = {
  heroFallback: {
    badge: 'Tienda física en Barquisimeto',
    title: BRAND.tagline.slice(0, 90),
    subtitle:
      'Tecnología, variedades y los productos virales del momento. Visítanos en Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001 — o pide por la web y te lo enviamos a cualquier parte de Venezuela.',
    ctaText: 'Explorar todo el catálogo',
    ctaLink: '/productos',
    imageUrl: '',
  },
  brandStrip: {
    enabled: true,
    slogan: BRAND_STRIP_SLOGAN,
    note: 'Carrera 21 con esquina calle 21, Centro · Barquisimeto 3001',
  },
  whatsapp: {
    enabled: true,
    phone: '',
    message: `¡Hola ${BRAND.name}! Vengo de la página web y quiero preguntar por un producto.`,
  },
  productTrust: [
    {
      icon: 'store',
      title: 'Tienda física en el Centro',
      sub: 'Pásate por Carrera 21 o pide desde la web',
    },
    {
      icon: 'truck',
      title: 'Delivery gratis en Barquisimeto',
      sub: 'Centro y Este (condiciones aplican).',
    },
    {
      icon: 'shield',
      title: 'Garantía 7 días',
      sub: 'En electrónica general, con factura y caja',
    },
    {
      icon: 'wallet',
      title: 'Pago Móvil · Transferencia · Binance',
      sub: 'Pagas en bolívares o en dólares, a tasa del día',
    },
  ],
  popup: {
    enabled: false,
    badge: 'Solo esta semana',
    title: 'Tremendo precio en lo más pedido',
    text: 'Pásate por el catálogo: bajamos el precio de los productos que más nos piden por WhatsApp.',
    ctaText: 'Ver las ofertas',
    ctaLink: '/productos',
    imageUrl: '',
    frequencyDays: 7,
    delaySeconds: 6,
    endsAt: '',
  },
};
