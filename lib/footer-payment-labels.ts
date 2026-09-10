/**
 * Etiquetas públicas de métodos de pago para el footer.
 * Unión de canales web + WhatsApp, orden global por sortOrder.
 */
import {
  applyGlobalDivisaDiscount,
  buildCheckoutPaymentMethods,
  mergePaymentMethodsWithDefaults,
  type PaymentSettingsSlice,
} from '@/lib/payment-methods';

/**
 * Une métodos activos disponibles en web y/o WhatsApp por id.
 * Orden global: sortOrder de la configuración normalizada (no el orden
 * de concatenar canales).
 */
export function buildFooterPaymentMethodLabels(
  settings: PaymentSettingsSlice,
): string[] {
  const web = buildCheckoutPaymentMethods(settings, 'web');
  const whatsapp = buildCheckoutPaymentMethods(settings, 'whatsapp');

  const availableIds = new Set<string>();
  for (const method of web) availableIds.add(method.id);
  for (const method of whatsapp) availableIds.add(method.id);

  if (availableIds.size === 0) return [];

  const normalized = applyGlobalDivisaDiscount(
    mergePaymentMethodsWithDefaults(settings.paymentMethods),
    {
      enabled: Boolean(settings.divisaDiscountEnabled),
      percent: settings.divisaDiscountPercent ?? 0,
    },
  );

  const labels: string[] = [];
  const seen = new Set<string>();

  for (const method of normalized) {
    if (!availableIds.has(method.id) || seen.has(method.id)) continue;
    seen.add(method.id);
    const name = method.name.trim();
    if (!name) continue;
    labels.push(name);
  }

  return labels;
}
