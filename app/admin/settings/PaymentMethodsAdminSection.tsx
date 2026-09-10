'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { PaymentMethodConfig, PaymentSettingsSlice } from '@/lib/payment-methods';
import {
  createCustomForeignCurrencyMethod,
  isDeletablePaymentMethod,
  isMethodConfiguredForFull,
  DISCOUNT_ELIGIBLE_KINDS,
} from '@/lib/payment-methods';
import {
  Field,
  TextareaField,
  Toggle,
  StatusBadge,
  HelpCallout,
  CollapsibleSection,
} from '@/app/admin/settings/components/SettingsUI';

type Props = {
  methods: PaymentMethodConfig[];
  onChange: (methods: PaymentMethodConfig[]) => void;
  fieldError: (path: string) => string | undefined;
  accountSettings?: Pick<PaymentSettingsSlice, 'pagoMovil' | 'transferencia' | 'binancePayId'>;
};

function showAcceptedCurrencies(kind: PaymentMethodConfig['kind']): boolean {
  return kind === 'CUSTOM_FOREIGN_CURRENCY' || kind === 'ZELLE';
}

function showCashUsdOnly(kind: PaymentMethodConfig['kind']): boolean {
  return kind === 'CASH_FOREIGN_CURRENCY';
}

function showRecipientFields(kind: PaymentMethodConfig['kind']): boolean {
  return (
    kind === 'ZELLE' ||
    kind === 'CASH_FOREIGN_CURRENCY' ||
    kind === 'CUSTOM_FOREIGN_CURRENCY'
  );
}

function usesAccountSection(kind: PaymentMethodConfig['kind']): boolean {
  return kind === 'PAGO_MOVIL' || kind === 'BANK_TRANSFER' || kind === 'BINANCE';
}

function channelConfigHelp(
  method: PaymentMethodConfig,
): string | null {
  if (
    method.kind !== 'BINANCE' &&
    method.kind !== 'ZELLE' &&
    method.kind !== 'CUSTOM_FOREIGN_CURRENCY'
  ) {
    return null;
  }
  if (method.enabledInFull) {
    return 'Checkout Full requiere los datos del destinatario para completar el pago dentro de la web.';
  }
  if (method.enabledInWhatsapp) {
    return 'En WhatsApp estos datos son opcionales. Los coordinaremos con el cliente después de crear el pedido.';
  }
  return null;
}

/** WhatsApp listo salvo efectivo sin monedas. */
function isWhatsappReady(method: PaymentMethodConfig): boolean {
  if (method.kind === 'CASH_FOREIGN_CURRENCY') {
    return method.acceptedCurrencies.length > 0;
  }
  return true;
}

export function PaymentMethodsAdminSection({
  methods,
  onChange,
  fieldError,
  accountSettings,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const baseId = useId();

  const updateAt = (index: number, patch: Partial<PaymentMethodConfig>) => {
    const next = methods.map((m, i) => {
      if (i !== index) return m;
      const merged = { ...m, ...patch };
      if (!merged.discountEligible) {
        merged.discountEnabled = false;
        merged.discountPercent = 0;
      }
      return merged;
    });
    onChange(next);
  };

  const removeAt = (index: number) => {
    const m = methods[index];
    if (!m || !isDeletablePaymentMethod(m)) return;
    if (
      !window.confirm(
        '¿Eliminar este método personalizado? El cambio se aplicará al guardar.',
      )
    ) {
      return;
    }
    if (openId === m.id) setOpenId(null);
    onChange(methods.filter((_, i) => i !== index));
  };

  const addCustom = () => {
    const created = createCustomForeignCurrencyMethod(methods);
    onChange([...methods, created]);
    setOpenId(created.id);
  };

  useEffect(() => {
    if (!openId) return;
    const el = itemRefs.current[openId];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [openId, methods.length]);

  const settingsSlice: PaymentSettingsSlice = {
    pagoMovil: accountSettings?.pagoMovil ?? { bank: '', phone: '', idNumber: '' },
    transferencia: accountSettings?.transferencia ?? {
      bank: '',
      accountNumber: '',
      accountHolder: '',
      rif: '',
    },
    binancePayId: accountSettings?.binancePayId ?? '',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500">
          Abre un método para configurar disponibilidad, datos al cliente y validación del checkout
          completo.
        </p>
        <button
          type="button"
          onClick={addCustom}
          className="shrink-0 min-h-[44px] rounded-xl bg-navy text-white text-xs font-semibold px-3 py-2 hover:bg-navy-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          Agregar método en divisas
        </button>
      </div>

      {fieldError('paymentMethods') && (
        <p role="alert" className="text-xs text-rose-600">
          {fieldError('paymentMethods')}
        </p>
      )}

      <div className="space-y-3">
        {methods.map((method, index) => {
          const open = openId === method.id;
          const panelId = `${baseId}-${method.id}-panel`;
          const fullReady = isMethodConfiguredForFull(method, settingsSlice);
          const canDiscount = DISCOUNT_ELIGIBLE_KINDS.has(method.kind);
          const whatsappReady = isWhatsappReady(method);
          const channelHelp = channelConfigHelp(method);

          return (
            <div
              key={method.id}
              ref={(el) => {
                itemRefs.current[method.id] = el;
              }}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 px-4 py-3">
                <button
                  type="button"
                  id={`${baseId}-${method.id}-trigger`}
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenId(open ? null : method.id)}
                  className="flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy rounded-lg"
                >
                  <p className="text-sm font-semibold text-navy">{method.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusBadge
                      status={method.active ? 'active' : 'inactive'}
                      label={method.active ? 'Activo' : 'Inactivo'}
                    />
                    {method.enabledInWhatsapp && (
                      <StatusBadge
                        status={whatsappReady ? 'ok' : 'warn'}
                        label={whatsappReady ? 'WhatsApp listo' : 'WhatsApp incompleto'}
                      />
                    )}
                    {method.enabledInFull && (
                      <StatusBadge
                        status={fullReady ? 'ok' : 'warn'}
                        label={fullReady ? 'Full listo' : 'Full incompleto'}
                      />
                    )}
                    {canDiscount && <StatusBadge status="ok" label="Divisa" />}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : method.id)}
                  className="shrink-0 min-h-[44px] px-3 rounded-lg border border-slate-200 text-xs font-semibold text-navy hover:bg-slate-50"
                >
                  {open ? 'Cerrar' : 'Configurar'}
                </button>
              </div>

              <div
                id={panelId}
                role="region"
                aria-labelledby={`${baseId}-${method.id}-trigger`}
                hidden={!open}
                className={open ? 'border-t border-slate-100 px-4 py-4 space-y-5' : undefined}
              >
                {open && (
                  <>
                    {method.kind === 'CASHEA' && (
                      <HelpCallout variant="info">
                        Cashea no recibe descuento por pago en divisas. Sus credenciales y
                        activación automática se administran en el servidor.
                      </HelpCallout>
                    )}

                    {usesAccountSection(method.kind) && (
                      <HelpCallout>
                        Los datos de la cuenta receptora se configuran en la sección Cuentas para
                        recibir pagos, arriba.
                      </HelpCallout>
                    )}

                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Disponibilidad
                      </h4>
                      <Toggle
                        label="Activo"
                        help="Apaga completamente este método."
                        checked={method.active}
                        onChange={(v) => updateAt(index, { active: v })}
                      />
                      <Toggle
                        label="Disponible en WhatsApp"
                        help="El cliente lo selecciona en la web y el pedido se coordina por WhatsApp."
                        checked={method.enabledInWhatsapp}
                        onChange={(v) => updateAt(index, { enabledInWhatsapp: v })}
                      />
                      <Toggle
                        label="Disponible en checkout Full"
                        help="El cliente completa el pago/comprobante dentro del checkout completo."
                        checked={method.enabledInFull}
                        onChange={(v) => updateAt(index, { enabledInFull: v })}
                      />
                      {method.enabledInFull && (
                        <p className="text-[11px] text-slate-500">
                          Si activas checkout Full, debes completar los datos necesarios para que el
                          cliente pueda pagar sin coordinación manual.
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Datos mostrados al cliente
                      </h4>
                      {channelHelp && (
                        <HelpCallout variant="info">{channelHelp}</HelpCallout>
                      )}
                      <Field
                        label="Nombre"
                        value={method.name}
                        onChange={(v) => updateAt(index, { name: v })}
                        error={fieldError(`paymentMethods.${index}.name`)}
                      />
                      <Field
                        label="Descripción"
                        value={method.description}
                        onChange={(v) => updateAt(index, { description: v })}
                        error={fieldError(`paymentMethods.${index}.description`)}
                      />
                      <TextareaField
                        label="Instrucciones"
                        value={method.instructions}
                        onChange={(v) => updateAt(index, { instructions: v })}
                        error={fieldError(`paymentMethods.${index}.instructions`)}
                        rows={4}
                      />
                      {showRecipientFields(method.kind) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field
                            label="Etiqueta del destinatario"
                            value={method.recipientLabel}
                            onChange={(v) => updateAt(index, { recipientLabel: v })}
                          />
                          <Field
                            label="Dato del destinatario"
                            value={method.recipientValue}
                            onChange={(v) => updateAt(index, { recipientValue: v })}
                            error={fieldError(`paymentMethods.${index}.recipientValue`)}
                          />
                        </div>
                      )}
                    </div>

                    {method.enabledInFull && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Validación en checkout Full
                        </h4>
                        <Toggle
                          label="Requiere referencia"
                          checked={method.requireReferenceInFull}
                          onChange={(v) => updateAt(index, { requireReferenceInFull: v })}
                        />
                        <Toggle
                          label="Requiere comprobante"
                          checked={method.requireProofInFull}
                          onChange={(v) => updateAt(index, { requireProofInFull: v })}
                        />
                      </div>
                    )}

                    {(showAcceptedCurrencies(method.kind) ||
                      showCashUsdOnly(method.kind) ||
                      method.fullDeliveryScope === 'STORE_PICKUP_ONLY') && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Monedas y entrega
                        </h4>
                        {showCashUsdOnly(method.kind) && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Moneda aceptada para efectivo
                            </label>
                            <input
                              type="text"
                              readOnly
                              value="USD"
                              className="w-full min-h-[48px] px-3 border border-gray-200 rounded-lg text-sm bg-gray-100 text-slate-600"
                            />
                            <p className="mt-1 text-xs text-slate-500">
                              MundoTech recibe efectivo solamente en USD.
                            </p>
                          </div>
                        )}
                        {showAcceptedCurrencies(method.kind) && (
                          <Field
                            label="Monedas aceptadas (separadas por coma)"
                            value={method.acceptedCurrencies.join(', ')}
                            onChange={(v) =>
                              updateAt(index, {
                                acceptedCurrencies: v
                                  .split(',')
                                  .map((c) => c.trim().toUpperCase())
                                  .filter(Boolean)
                                  .slice(0, 10),
                              })
                            }
                            error={fieldError(`paymentMethods.${index}.acceptedCurrencies`)}
                          />
                        )}
                      </div>
                    )}

                    <CollapsibleSection title="Opciones avanzadas" defaultOpen={false}>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
                          <input
                            type="text"
                            readOnly
                            value={method.id}
                            className="w-full min-h-[48px] px-3 border border-gray-200 rounded-lg text-sm bg-gray-100 text-slate-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tipo interno
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={method.kind}
                            className="w-full min-h-[48px] px-3 border border-gray-200 rounded-lg text-sm bg-gray-100 text-slate-500"
                          />
                        </div>
                        <Field
                          label="Orden visual"
                          type="number"
                          value={String(method.sortOrder)}
                          onChange={(v) => {
                            const n = Number.parseInt(v, 10);
                            updateAt(index, {
                              sortOrder: Number.isFinite(n) ? n : method.sortOrder,
                            });
                          }}
                        />
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Alcance de entrega
                          </label>
                          <select
                            className="w-full min-h-[48px] px-3 border border-gray-200 rounded-lg text-sm bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
                            value={method.fullDeliveryScope}
                            onChange={(e) =>
                              updateAt(index, {
                                fullDeliveryScope: e.target
                                  .value as PaymentMethodConfig['fullDeliveryScope'],
                              })
                            }
                          >
                            <option value="ANY">Cualquier modalidad</option>
                            <option value="STORE_PICKUP_ONLY">Solo retiro en tienda</option>
                          </select>
                          {method.fullDeliveryScope === 'STORE_PICKUP_ONLY' && (
                            <p className="mt-1 text-[11px] text-amber-700">
                              En checkout completo este método solo aparecerá para retiro en tienda.
                            </p>
                          )}
                        </div>
                      </div>
                    </CollapsibleSection>

                    {isDeletablePaymentMethod(method) && (
                      <button
                        type="button"
                        onClick={() => removeAt(index)}
                        className="text-xs font-semibold text-rose-600 hover:underline min-h-[44px]"
                      >
                        Eliminar método personalizado
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
