'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, RefreshCw, Calculator, AlertTriangle } from 'lucide-react';
import { updateExchangeRate, updatePricingParams, getPricingParams } from '@/app/actions/configActions';
import { recalculateAllProductPrices } from '@/app/actions/productActions';
import {
  SectionCard,
  Field,
  HelpCallout,
} from '@/app/admin/settings/components/SettingsUI';

function formatBcvDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function PricingSettingsPanel({ bcvDate }: { bcvDate: string | null }) {
  const router = useRouter();

  const [currentRate, setCurrentRate] = useState<number | null>(null);
  const [newRate, setNewRate] = useState('');
  const [rateMsg, setRateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isUpdatingRate, startRateTransition] = useTransition();

  const [marginPct, setMarginPct] = useState('');
  const [factor, setFactor] = useState('');
  const [pricingMsg, setPricingMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSavingPricing, startPricingTransition] = useTransition();
  const [isRecalculating, startRecalcTransition] = useTransition();
  const [recalcMsg, setRecalcMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/config/exchange-rate')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (typeof data?.rate === 'number') {
          setCurrentRate(data.rate);
          setNewRate(data.rate.toString());
        }
      })
      .catch((err) => {
        console.error('[admin/settings] error cargando tasa:', err);
        setRateMsg({ ok: false, text: 'No se pudo cargar la tasa actual. Recarga la página.' });
      });
  }, []);

  useEffect(() => {
    getPricingParams()
      .then(({ marginPct: m, factor: f }) => {
        setMarginPct(String(m));
        setFactor(String(f));
      })
      .catch((err) => console.error('[admin/settings] error cargando fórmula:', err));
  }, []);

  const handleRateUpdate = () => {
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate <= 0) {
      setRateMsg({ ok: false, text: 'Ingresa un número positivo válido.' });
      return;
    }
    startRateTransition(async () => {
      const result = await updateExchangeRate(rate);
      setRateMsg({ ok: result.success, text: result.message });
      if (result.success) {
        setCurrentRate(rate);
        router.refresh();
      }
      setTimeout(() => setRateMsg(null), 4000);
    });
  };

  const handlePricingUpdate = () => {
    startPricingTransition(async () => {
      // marginPct se mantiene en estado técnico (requerido por updatePricingParams)
      // pero no se presenta como margen global editable.
      const result = await updatePricingParams({ marginPct, factor });
      setPricingMsg({ ok: result.success, text: result.message });
      if (result.success) router.refresh();
      setTimeout(() => setPricingMsg(null), 4000);
    });
  };

  const handleRecalc = () => {
    if (
      !window.confirm(
        'Esto recalculará el precio de TODOS los productos con costo, usando la tasa actual y el margen guardado de cada producto. Las ofertas conservan su % de descuento, y los productos con precio manual (sin costo) no se tocan. ¿Continuar?',
      )
    ) {
      return;
    }
    startRecalcTransition(async () => {
      const result = await recalculateAllProductPrices();
      setRecalcMsg({ ok: result.success, text: result.message });
      if (result.success) router.refresh();
      setTimeout(() => setRecalcMsg(null), 6000);
    });
  };

  return (
    <div className="space-y-6 pb-8 max-w-3xl">
      <SectionCard title="Tasa USD / Bs" icon={DollarSign} accent>
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <DollarSign size={22} className="text-yellow-700 flex-shrink-0" />
          <div>
            <p className="text-xs text-yellow-700 font-medium">Tasa actual</p>
            <p className="text-2xl font-bold text-yellow-900 tracking-tight">
              {currentRate !== null ? `Bs. ${currentRate.toFixed(2)} / USD` : '—'}
            </p>
            {bcvDate && (
              <p className="text-xs text-yellow-600 mt-0.5">
                Tasa BCV del {formatBcvDate(bcvDate)}
              </p>
            )}
          </div>
        </div>

        <HelpCallout variant="warning">
          Cambiar la tasa afecta los precios mostrados en bolívares. Los pedidos ya creados
          conservan su tasa congelada.
        </HelpCallout>

        <div className="flex flex-col sm:flex-row gap-2 max-w-md">
          <input
            type="number"
            step="0.01"
            min="0"
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            placeholder="Ej: 40.50"
            aria-label="Nuevo valor de tasa"
            className="flex-1 px-3 py-2 min-h-[48px] border border-gray-200 bg-gray-50 text-sm rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
          />
          <button
            type="button"
            onClick={handleRateUpdate}
            disabled={isUpdatingRate}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 py-2 bg-navy text-white text-sm font-semibold rounded-lg hover:bg-navy/90 disabled:opacity-60 transition"
          >
            <RefreshCw size={15} className={isUpdatingRate ? 'animate-spin' : ''} />
            {isUpdatingRate ? 'Actualizando…' : 'Actualizar tasa'}
          </button>
        </div>
        {rateMsg && (
          <p
            role="alert"
            className={`text-sm font-medium ${rateMsg.ok ? 'text-green-600' : 'text-red-600'}`}
          >
            {rateMsg.text}
          </p>
        )}
      </SectionCard>

      <SectionCard title="Factor de precio" icon={Calculator}>
        <HelpCallout>
          Este factor participa en la fórmula de precio junto con el costo y el margen guardado de
          cada producto.
        </HelpCallout>
        <div className="max-w-xs">
          <Field
            label="Factor adicional de precio"
            value={factor}
            onChange={setFactor}
            type="number"
            placeholder="1.5"
          />
        </div>
        {/* marginPct se conserva en estado y se envía a updatePricingParams sin
            presentarlo como margen global editable (el margen es por producto). */}
        <input type="hidden" value={marginPct} readOnly aria-hidden tabIndex={-1} />
        <button
          type="button"
          onClick={handlePricingUpdate}
          disabled={isSavingPricing}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 bg-navy text-white text-sm font-semibold rounded-lg hover:bg-navy/90 disabled:opacity-60 transition"
        >
          <RefreshCw size={15} className={isSavingPricing ? 'animate-spin' : ''} />
          {isSavingPricing ? 'Actualizando…' : 'Aplicar factor'}
        </button>
        {pricingMsg && (
          <p
            role="alert"
            className={`text-sm font-medium ${pricingMsg.ok ? 'text-green-600' : 'text-red-600'}`}
          >
            {pricingMsg.text}
          </p>
        )}
      </SectionCard>

      <SectionCard title="Recalcular catálogo" icon={AlertTriangle}>
        <HelpCallout variant="danger">
          Recalcula únicamente productos con costo utilizando su margen guardado. Los productos con
          precio manual no cambian y las ofertas conservan su descuento.
        </HelpCallout>
        <p className="text-xs text-gray-500">
          No se ejecuta automáticamente al cambiar la tasa. Confirma antes de continuar.
        </p>
        <button
          type="button"
          onClick={handleRecalc}
          disabled={isRecalculating}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 bg-white border border-amber-300 text-amber-900 text-sm font-semibold rounded-lg hover:bg-amber-50 disabled:opacity-60 transition"
        >
          <RefreshCw size={15} className={isRecalculating ? 'animate-spin' : ''} />
          {isRecalculating ? 'Recalculando…' : 'Recalcular precios de todos los productos'}
        </button>
        {recalcMsg && (
          <p
            role="alert"
            className={`text-sm font-medium ${recalcMsg.ok ? 'text-green-600' : 'text-red-600'}`}
          >
            {recalcMsg.text}
          </p>
        )}
      </SectionCard>
    </div>
  );
}
