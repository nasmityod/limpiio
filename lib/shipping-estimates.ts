/**
 * MEJORA 2.3 / ADM-11 (AUDITORIA-2026-07): tipos, schema y lógica pura de
 * estimados de envío. Sin dependencia de Prisma para poder importarse desde
 * Client Components.
 *
 * Las funciones DB (readShippingEstimates, writeShippingEstimates) están en
 * lib/shipping-estimates-db.ts — solo importables desde Server Components.
 *
 * Modelo: nota por método (tienda/MRW/ZOOM) + overrides opcionales por estado.
 */
import { z } from 'zod';

export const SHIPPING_ESTIMATES_KEY = 'shipping_estimates';

const stateEstimateSchema = z.object({
  state: z.string().min(1).max(60),
  note:  z.string().min(1).max(200),
});

export const shippingEstimatesSchema = z.object({
  /** Nota bajo "Retirar en tienda". Vacío = no se muestra. */
  tienda: z.string().max(200).optional().default(''),
  /** Nota general para MRW (fallback si el estado no tiene override). */
  mrw: z.string().max(200).optional().default(''),
  /** Nota general para ZOOM (fallback si el estado no tiene override). */
  zoom: z.string().max(200).optional().default(''),
  /** Nota general para TEALCA (fallback si el estado no tiene override). */
  tealca: z.string().max(200).optional().default(''),
  /** Overrides por estado (aplican a MRW, ZOOM y TEALCA). */
  states: z.array(stateEstimateSchema).max(30).optional().default([]),
});

export type ShippingEstimates = z.infer<typeof shippingEstimatesSchema>;

export const DEFAULT_SHIPPING_ESTIMATES: ShippingEstimates = {
  tienda: '',
  mrw: '',
  zoom: '',
  tealca: '',
  states: [],
};

/** Nota a mostrar para un método + estado (override por estado > nota del método). */
export function estimateFor(
  estimates: ShippingEstimates,
  method: 'tienda' | 'mrw' | 'zoom' | 'tealca',
  state?: string | null,
): string {
  if (method === 'tienda') return estimates.tienda.trim();
  if (state) {
    const override = estimates.states.find(
      (s) => s.state.trim().toLowerCase() === state.trim().toLowerCase(),
    );
    if (override) return override.note.trim();
  }
  return estimates[method].trim();
}
