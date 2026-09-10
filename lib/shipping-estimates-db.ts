/**
 * Funciones DB para estimados de envío (Prisma). Solo importables desde
 * Server Components para no arrastrar pg al bundle del browser.
 */
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/safe-logger';
import {
  SHIPPING_ESTIMATES_KEY,
  shippingEstimatesSchema,
  DEFAULT_SHIPPING_ESTIMATES,
} from '@/lib/shipping-estimates';
import type { ShippingEstimates } from '@/lib/shipping-estimates';

export async function readShippingEstimates(): Promise<ShippingEstimates> {
  try {
    const record = await prisma.appConfig.findUnique({
      where: { key: SHIPPING_ESTIMATES_KEY },
    });
    if (!record?.value) return DEFAULT_SHIPPING_ESTIMATES;
    const parsed = shippingEstimatesSchema.safeParse(JSON.parse(record.value));
    if (!parsed.success) {
      logError('shipping_estimates_corrupt', new Error('Invalid JSON in AppConfig'), {
        operation: 'read_shipping_estimates',
      });
      return DEFAULT_SHIPPING_ESTIMATES;
    }
    return parsed.data;
  } catch (err) {
    logError('shipping_estimates_read_failed', err, { operation: 'read_shipping_estimates', provider: 'postgres' });
    return DEFAULT_SHIPPING_ESTIMATES;
  }
}

export async function writeShippingEstimates(value: ShippingEstimates): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: SHIPPING_ESTIMATES_KEY },
    update: { value: JSON.stringify(value) },
    create: { key: SHIPPING_ESTIMATES_KEY, value: JSON.stringify(value) },
  });
}
