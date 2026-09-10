/**
 * Paleta MundoTech para correos transaccionales — fondo CLARO (decisión del
 * dueño: nada de emails dark). La única zona oscura es la cabecera, que
 * reproduce el letrero físico de la tienda: banda negra con el logo amarillo.
 */
export const MT = {
  /** Fondo de la página del correo (gris azulado muy claro). */
  pageBg: '#F2F4F8',
  /** Tarjeta principal. */
  cardBg: '#FFFFFF',
  /** Secciones internas suaves (resúmenes, tarjetas de producto). */
  cardBgAlt: '#F8FAFC',
  border: '#E4E8EF',
  textPrimary: '#0B1220',
  textMuted: '#5B6573',
  /** Amarillo de marca — usar como FONDO o acento, nunca como texto sobre blanco. */
  gold: '#FFD700',
  /** Dorado oscuro legible para links/texto sobre fondo claro (contraste AA). */
  goldText: '#8a6d00',
  navy: '#0B1220',
  /** Banda-letrero de la cabecera (negro mate del local físico). */
  bandBg: '#000000',
  /** Verde con contraste suficiente sobre blanco. */
  success: '#1F9D5B',
  danger: '#DC2626',
} as const;

export const fontSans = "Arial, Helvetica, sans-serif";
