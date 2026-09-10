'use client';

import { useCallback, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import type { FinancialSettingsDto, GeneralSettingsDto } from '@/lib/settings-api-schemas';
import type { ShippingEstimates } from '@/lib/shipping-estimates';
import { SettingsTabs, type SettingsTab } from '@/app/admin/settings/components/SettingsTabs';
import { StoreSettingsPanel } from '@/app/admin/settings/StoreSettingsPanel';
import { PaymentsSettingsPanel } from '@/app/admin/settings/PaymentsSettingsPanel';
import { PricingSettingsPanel } from '@/app/admin/settings/PricingSettingsPanel';

const EMPTY_ESTIMATES: ShippingEstimates = {
  tienda: '',
  mrw: '',
  zoom: '',
  tealca: '',
  states: [],
};

export default function SettingsClient({
  canStoreSettings,
  canFinancialSettings,
  initialGeneral,
  initialFinancial,
  initialEstimates,
  bcvDate,
}: {
  canStoreSettings: boolean;
  canFinancialSettings: boolean;
  initialGeneral: GeneralSettingsDto | null;
  initialFinancial: FinancialSettingsDto | null;
  initialEstimates: ShippingEstimates | null;
  bcvDate: string | null;
}) {
  const availableTabs = useMemo(() => {
    const tabs: SettingsTab[] = [];
    if (canStoreSettings) tabs.push('store');
    if (canFinancialSettings) {
      tabs.push('payments');
      tabs.push('pricing');
    }
    return tabs;
  }, [canStoreSettings, canFinancialSettings]);

  const initialTab: SettingsTab = canStoreSettings
    ? 'store'
    : canFinancialSettings
      ? 'payments'
      : 'store';

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<SettingsTab, boolean>>>({});

  const setStoreDirty = useCallback((dirty: boolean) => {
    setDirtyTabs((prev) => (prev.store === dirty ? prev : { ...prev, store: dirty }));
  }, []);
  const setPaymentsDirty = useCallback((dirty: boolean) => {
    setDirtyTabs((prev) => (prev.payments === dirty ? prev : { ...prev, payments: dirty }));
  }, []);

  const safeActiveTab = availableTabs.includes(activeTab)
    ? activeTab
    : (availableTabs[0] ?? 'store');

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings size={22} className="text-navy" /> Configuración
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Administra la información de la tienda, pagos y reglas de precios.
        </p>
      </div>

      <SettingsTabs
        activeTab={safeActiveTab}
        onChange={setActiveTab}
        availableTabs={availableTabs}
        dirtyTabs={dirtyTabs}
      />

      {canStoreSettings && initialGeneral && (
        <div
          id="settings-panel-store"
          role="tabpanel"
          aria-labelledby="settings-tab-store"
          hidden={safeActiveTab !== 'store'}
        >
          <StoreSettingsPanel
            initialGeneral={initialGeneral}
            initialEstimates={initialEstimates ?? EMPTY_ESTIMATES}
            onDirtyChange={setStoreDirty}
          />
        </div>
      )}

      {canFinancialSettings && initialFinancial && (
        <div
          id="settings-panel-payments"
          role="tabpanel"
          aria-labelledby="settings-tab-payments"
          hidden={safeActiveTab !== 'payments'}
        >
          <PaymentsSettingsPanel
            initialFinancial={initialFinancial}
            onDirtyChange={setPaymentsDirty}
          />
        </div>
      )}

      {canFinancialSettings && (
        <div
          id="settings-panel-pricing"
          role="tabpanel"
          aria-labelledby="settings-tab-pricing"
          hidden={safeActiveTab !== 'pricing'}
        >
          <PricingSettingsPanel bcvDate={bcvDate} />
        </div>
      )}
    </div>
  );
}
