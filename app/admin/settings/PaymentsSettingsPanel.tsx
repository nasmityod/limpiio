'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Building2, Wallet, DollarSign, ListOrdered } from 'lucide-react';
import { updateFinancialSettings } from '@/app/actions/settingsActions';
import type { FinancialSettingsDto } from '@/lib/settings-api-schemas';
import { DEFAULT_PAYMENT_METHODS, estimatePaymentDiscountUsd } from '@/lib/payment-methods';
import PhotoUploader from '@/components/admin/PhotoUploader';
import { PaymentMethodsAdminSection } from '@/app/admin/settings/PaymentMethodsAdminSection';
import {
  SectionCard,
  Field,
  HelpCallout,
  StickySaveBar,
  CollapsibleSection,
  StatusBadge,
  Toggle,
  type SaveBarStatus,
} from '@/app/admin/settings/components/SettingsUI';

function snapshotJson(value: unknown): string {
  return JSON.stringify(value);
}

function isPagoMovilConfigured(pm: FinancialSettingsDto['pagoMovil']): boolean {
  return Boolean(pm.bank.trim() && pm.phone.trim() && pm.idNumber.trim());
}

function isTransferenciaConfigured(tr: FinancialSettingsDto['transferencia']): boolean {
  return Boolean(
    tr.bank.trim() && tr.accountNumber.trim() && tr.accountHolder.trim() && tr.rif.trim(),
  );
}

function accountTail(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  if (digits.length < 4) return accountNumber.trim() ? '••••' : '';
  return `••••${digits.slice(-4)}`;
}

export function PaymentsSettingsPanel({
  initialFinancial,
  onDirtyChange,
}: {
  initialFinancial: FinancialSettingsDto;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const percentInputId = useId();

  const [financialSettings, setFinancialSettings] = useState(initialFinancial);
  const [snapshot, setSnapshot] = useState(snapshotJson(initialFinancial));
  const [savingFinancial, setSavingFinancial] = useState(false);
  const [savedFinancial, setSavedFinancial] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirtyFinancial = snapshotJson(financialSettings) !== snapshot;

  useEffect(() => {
    onDirtyChange?.(dirtyFinancial);
  }, [dirtyFinancial, onDirtyChange]);

  const fieldError = (path: string) => fieldErrors[path];

  const setFinancial = (path: string[], value: string) => {
    setFinancialSettings((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FinancialSettingsDto;
      let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]!] as Record<string, unknown>;
      obj[path[path.length - 1]!] = value;
      return next;
    });
    setSavedFinancial(false);
  };

  const focusFirstError = (preferId?: string) => {
    if (preferId) {
      const preferred = document.getElementById(preferId);
      if (preferred) {
        preferred.focus();
        if (typeof preferred.scrollIntoView === 'function') {
          preferred.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
    }
    const el = panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSaveFinancial = async () => {
    const divisaEnabled = Boolean(financialSettings.divisaDiscountEnabled);
    const divisaPercent = Number(financialSettings.divisaDiscountPercent ?? 0);
    if (divisaEnabled && !(divisaPercent > 0)) {
      setSaveError(
        'No puedes activar el descuento por pago en divisas con porcentaje 0. Indica un % mayor a 0 o desactiva el interruptor.',
      );
      setFieldErrors({
        divisaDiscountPercent: 'Con el descuento activo, el porcentaje debe ser mayor a 0.',
      });
      queueMicrotask(() => focusFirstError(percentInputId));
      return;
    }

    setSavingFinancial(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      const result = await updateFinancialSettings({
        ...financialSettings,
        divisaDiscountEnabled: divisaEnabled,
        divisaDiscountPercent: divisaPercent,
      });
      if (result.success) {
        if (result.data) {
          setFinancialSettings(result.data);
          setSnapshot(snapshotJson(result.data));
        } else {
          setSnapshot(snapshotJson(financialSettings));
        }
        setSavedFinancial(true);
        setTimeout(() => setSavedFinancial(false), 3000);
        router.refresh();
      } else {
        setSaveError(result.message);
        if (result.errors) {
          const flat: Record<string, string> = {};
          for (const [path, msgs] of Object.entries(result.errors)) {
            if (msgs[0]) flat[path] = msgs[0];
          }
          setFieldErrors(flat);
          queueMicrotask(() => focusFirstError());
        }
      }
    } catch (err) {
      console.error('[admin/settings] error guardando financiero:', err);
      setSaveError('Error de conexión. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setSavingFinancial(false);
    }
  };

  const saveBarStatus: SaveBarStatus = useMemo(() => {
    if (savingFinancial) return 'saving';
    if (savedFinancial) return 'saved';
    if (saveError) return 'error';
    if (dirtyFinancial) return 'dirty';
    return 'idle';
  }, [savingFinancial, savedFinancial, saveError, dirtyFinancial]);

  const pagoOk = isPagoMovilConfigured(financialSettings.pagoMovil);
  const transferOk = isTransferenciaConfigured(financialSettings.transferencia);
  const binanceOk = Boolean((financialSettings.binancePayId ?? '').trim());

  const discountPct = Number(financialSettings.divisaDiscountPercent ?? 0);
  const discountPreview = estimatePaymentDiscountUsd(100, discountPct);
  const afterDiscount = Math.round((100 - discountPreview) * 100) / 100;

  return (
    <div ref={panelRef} className="space-y-6 pb-24 max-w-3xl">
      <SectionCard title="Cómo configurar los pagos" icon={ListOrdered}>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-navy">
          <li>Completa la cuenta o destinatario.</li>
          <li>Activa el método y elige en cuáles checkouts aparece.</li>
          <li>Guarda los cambios financieros.</li>
        </ol>
        <HelpCallout variant="warning">
          Un método activo pero sin los datos obligatorios puede ocultarse automáticamente del
          checkout.
        </HelpCallout>
      </SectionCard>

      <SectionCard title="Cuentas para recibir pagos" icon={Wallet}>
        <div className="space-y-3">
          <CollapsibleSection
            title="Pago Móvil"
            badge={
              <StatusBadge
                status={pagoOk ? 'ok' : 'warn'}
                label={pagoOk ? 'Configurado' : 'Incompleto'}
              />
            }
            summary={
              pagoOk
                ? `Banco: ${financialSettings.pagoMovil.bank}`
                : 'Faltan banco, teléfono o cédula/RIF'
            }
          >
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Phone size={14} aria-hidden /> Datos mostrados al cliente
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <Field
                label="Banco"
                value={financialSettings.pagoMovil.bank}
                onChange={(v) => setFinancial(['pagoMovil', 'bank'], v)}
                placeholder="Banesco"
                error={fieldError('pagoMovil.bank')}
              />
              <Field
                label="Teléfono"
                value={financialSettings.pagoMovil.phone}
                onChange={(v) => setFinancial(['pagoMovil', 'phone'], v)}
                type="tel"
                placeholder="0412-1234567"
                error={fieldError('pagoMovil.phone')}
              />
              <Field
                label="Cédula/RIF del receptor"
                value={financialSettings.pagoMovil.idNumber}
                onChange={(v) => setFinancial(['pagoMovil', 'idNumber'], v)}
                placeholder="V-12.345.678"
                error={fieldError('pagoMovil.idNumber')}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Transferencia bancaria"
            badge={
              <StatusBadge
                status={transferOk ? 'ok' : 'warn'}
                label={transferOk ? 'Configurado' : 'Incompleto'}
              />
            }
            summary={
              transferOk
                ? `${financialSettings.transferencia.bank} · ${accountTail(financialSettings.transferencia.accountNumber)}`
                : 'Faltan banco, cuenta, titular o RIF'
            }
          >
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Building2 size={14} aria-hidden /> Datos mostrados al cliente
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <Field
                label="Banco"
                value={financialSettings.transferencia.bank}
                onChange={(v) => setFinancial(['transferencia', 'bank'], v)}
                placeholder="Mercantil"
                error={fieldError('transferencia.bank')}
              />
              <Field
                label="Número de cuenta"
                value={financialSettings.transferencia.accountNumber}
                onChange={(v) => setFinancial(['transferencia', 'accountNumber'], v)}
                placeholder="0105-0000-00-1234567890"
                error={fieldError('transferencia.accountNumber')}
              />
              <Field
                label="Titular"
                value={financialSettings.transferencia.accountHolder}
                onChange={(v) => setFinancial(['transferencia', 'accountHolder'], v)}
                placeholder="Empresa Ejemplo C.A."
                error={fieldError('transferencia.accountHolder')}
              />
              <Field
                label="RIF"
                value={financialSettings.transferencia.rif}
                onChange={(v) => setFinancial(['transferencia', 'rif'], v)}
                placeholder="J-12345678-9"
                error={fieldError('transferencia.rif')}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Binance Pay"
            badge={
              <StatusBadge
                status={binanceOk ? 'ok' : 'warn'}
                label={binanceOk ? 'Configurado' : 'Incompleto'}
              />
            }
            summary={
              binanceOk
                ? `Pay ID configurado${(financialSettings.binanceQrUrl ?? '').trim() ? ' · QR opcional listo' : ' · QR opcional'}`
                : 'Requiere Pay ID; el QR es opcional'
            }
          >
            <div className="grid grid-cols-1 gap-3 max-w-xl">
              <Field
                label="Pay ID"
                value={financialSettings.binancePayId ?? ''}
                onChange={(v) => setFinancial(['binancePayId'], v)}
                placeholder="Ej. 12345678"
              />
              <PhotoUploader
                label="QR"
                hint="Opcional. PNG, JPG o WEBP en R2 público."
                value={financialSettings.binanceQrUrl ?? ''}
                onChange={(url) => setFinancial(['binanceQrUrl'], url ?? '')}
                purpose="binance-qr"
                optional
                maxSizeMB={2}
                previewHeight="h-44"
              />
            </div>
          </CollapsibleSection>
        </div>
      </SectionCard>

      <SectionCard title="Promoción por pago en divisas" icon={DollarSign} accent>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={financialSettings.divisaDiscountEnabled ? 'active' : 'inactive'}
            label={financialSettings.divisaDiscountEnabled ? 'Activo' : 'Inactivo'}
          />
        </div>
        <Toggle
          label="Activar descuento por pago en divisas"
          checked={Boolean(financialSettings.divisaDiscountEnabled)}
          onChange={(checked) => {
            setFinancialSettings((prev) => ({
              ...prev,
              divisaDiscountEnabled: checked,
            }));
            setSavedFinancial(false);
          }}
        />
        <div>
          <label htmlFor={percentInputId} className="block text-sm font-medium text-gray-700 mb-1">
            Porcentaje
          </label>
          <input
            id={percentInputId}
            type="number"
            min={0}
            max={100}
            step={0.01}
            disabled={!financialSettings.divisaDiscountEnabled}
            value={String(financialSettings.divisaDiscountPercent ?? 0)}
            onChange={(e) => {
              const n = Number(e.target.value);
              setFinancialSettings((prev) => ({
                ...prev,
                divisaDiscountPercent: Number.isFinite(n) ? n : 0,
              }));
              setSavedFinancial(false);
            }}
            aria-invalid={fieldError('divisaDiscountPercent') ? true : undefined}
            className={`w-full max-w-xs px-3 py-2 min-h-[48px] rounded-lg border text-base sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 disabled:opacity-50 disabled:cursor-not-allowed ${
              fieldError('divisaDiscountPercent')
                ? 'border-red-400 bg-red-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          />
          {fieldError('divisaDiscountPercent') && (
            <p role="alert" className="text-xs text-red-600 mt-1 font-medium">
              {fieldError('divisaDiscountPercent')}
            </p>
          )}
        </div>
        {financialSettings.divisaDiscountEnabled && discountPct > 0 && (
          <p className="text-sm text-navy">
            Ejemplo: un subtotal de $100 recibe ${discountPreview.toFixed(2)} de descuento y queda
            en ${afterDiscount.toFixed(2)}
          </p>
        )}
        <HelpCallout variant="warning">
          Aplica a Binance, Zelle, efectivo y métodos personalizados. No aplica a Cashea, Pago
          Móvil, transferencia ni flete.
        </HelpCallout>
      </SectionCard>

      <SectionCard
        title="Métodos disponibles en el checkout"
        description="Controla qué métodos ve el cliente y en qué canal aparecen."
        icon={ListOrdered}
      >
        <PaymentMethodsAdminSection
          methods={
            financialSettings.paymentMethods ?? DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }))
          }
          onChange={(paymentMethods) => {
            setFinancialSettings((prev) => ({ ...prev, paymentMethods }));
            setSavedFinancial(false);
          }}
          fieldError={fieldError}
          accountSettings={{
            pagoMovil: financialSettings.pagoMovil,
            transferencia: financialSettings.transferencia,
            binancePayId: financialSettings.binancePayId,
          }}
        />
      </SectionCard>

      <StickySaveBar
        status={saveBarStatus}
        error={saveError}
        primaryLabel="Guardar configuración de pagos"
        onPrimary={handleSaveFinancial}
        primaryDisabled={!dirtyFinancial || savingFinancial}
      />
    </div>
  );
}
