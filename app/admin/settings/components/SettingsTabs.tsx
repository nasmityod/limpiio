'use client';

import { Store, Wallet, Calculator } from 'lucide-react';

export type SettingsTab = 'store' | 'payments' | 'pricing';

const TAB_META: Record<
  SettingsTab,
  { label: string; icon: React.ElementType; panelId: string }
> = {
  store: { label: 'Tienda y envíos', icon: Store, panelId: 'settings-panel-store' },
  payments: { label: 'Pagos', icon: Wallet, panelId: 'settings-panel-payments' },
  pricing: { label: 'Precios y tasa', icon: Calculator, panelId: 'settings-panel-pricing' },
};

export function SettingsTabs({
  activeTab,
  onChange,
  availableTabs,
  dirtyTabs,
}: {
  activeTab: SettingsTab;
  onChange: (tab: SettingsTab) => void;
  availableTabs: SettingsTab[];
  dirtyTabs: Partial<Record<SettingsTab, boolean>>;
}) {
  if (availableTabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Secciones de configuración"
      className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 border-b border-gray-200 mb-6 scrollbar-thin"
    >
      {availableTabs.map((tab) => {
        const meta = TAB_META[tab];
        const Icon = meta.icon;
        const selected = activeTab === tab;
        const dirty = Boolean(dirtyTabs[tab]);
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`settings-tab-${tab}`}
            aria-selected={selected}
            aria-controls={meta.panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') {
                return;
              }
              e.preventDefault();
              const idx = availableTabs.indexOf(tab);
              let nextIdx = idx;
              if (e.key === 'ArrowRight') nextIdx = (idx + 1) % availableTabs.length;
              if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + availableTabs.length) % availableTabs.length;
              if (e.key === 'Home') nextIdx = 0;
              if (e.key === 'End') nextIdx = availableTabs.length - 1;
              onChange(availableTabs[nextIdx]!);
              document.getElementById(`settings-tab-${availableTabs[nextIdx]}`)?.focus();
            }}
            className={`inline-flex items-center gap-2 shrink-0 min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
              selected
                ? 'border-navy text-navy bg-white'
                : 'border-transparent text-gray-500 hover:text-navy hover:bg-gray-50'
            }`}
          >
            <Icon size={16} aria-hidden />
            <span>{meta.label}</span>
            {dirty && (
              <span
                className="size-2 rounded-full bg-amber-400"
                title="Cambios sin guardar"
                aria-label="Cambios sin guardar"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
