import { readSettings } from '@/lib/data-store';
import { readShippingEstimates } from '@/lib/shipping-estimates-db';
import { prisma } from '@/lib/prisma';
import { EXCHANGE_RATE_BCV_DATE_KEY } from '@/lib/exchange-rate';
import { requireAdminPageAnyPermission } from '@/lib/admin-access-server';
import { hasAdminPermission } from '@/lib/admin-permissions';
import {
  pickFinancialSettingsDto,
  pickGeneralSettingsDto,
} from '@/lib/settings-api-schemas';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const access = await requireAdminPageAnyPermission(['STORE_SETTINGS', 'FINANCIAL_SETTINGS']);
  const canStoreSettings = hasAdminPermission(access, 'STORE_SETTINGS');
  const canFinancialSettings = hasAdminPermission(access, 'FINANCIAL_SETTINGS');

  const [settings, shippingEstimates, bcvDateRecord] = await Promise.all([
    readSettings(),
    canStoreSettings ? readShippingEstimates() : Promise.resolve(null),
    canFinancialSettings
      ? prisma.appConfig.findUnique({
          where: { key: EXCHANGE_RATE_BCV_DATE_KEY },
          select: { value: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <SettingsClient
      canStoreSettings={canStoreSettings}
      canFinancialSettings={canFinancialSettings}
      initialGeneral={canStoreSettings ? pickGeneralSettingsDto(settings) : null}
      initialFinancial={canFinancialSettings ? pickFinancialSettingsDto(settings) : null}
      initialEstimates={shippingEstimates}
      bcvDate={bcvDateRecord?.value ?? null}
    />
  );
}
