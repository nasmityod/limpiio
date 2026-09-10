'use client';

import { useState, useRef, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Building, ChevronRight, Copy, Check, UploadCloud, X, Wallet, AlertTriangle, Banknote } from 'lucide-react';
import { useReducedMotion, reducedTransition } from '@/lib/motion';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import type { StoreSettings } from '@/lib/data-store';
import { VENEZUELAN_BANKS } from '@/lib/venezuela-banks';
import { isHeicFile, normalizeImageForUpload } from '@/lib/client-image-normalize';
import {
  type CheckoutPaymentMethodDto,
  type PaymentCurrencyGroup,
} from '@/lib/payment-methods';

export type PaymentFormData = {
  paymentMethodId: string;
  paymentCurrency: string | null;
  bank: string;
  holderIdNumber: string;
  holderPhone: string;
  referenceNumber: string;
  proofFile: File | null;
  proofPreviewUrl: string;
};

export type PaymentFormHandle = {
  submit: () => PaymentFormData | null;
};

interface PaymentFormProps {
  onPaymentSubmit: (data: PaymentFormData) => void;
  /** Emite el método visible seleccionado (o null) en cuanto cambia la selección. */
  onSelectedMethodChange?: (method: CheckoutPaymentMethodDto | null) => void;
  initialData?: PaymentFormData | null;
  pagoMovil: StoreSettings['pagoMovil'];
  transferencia: StoreSettings['transferencia'];
  binancePayId?: string;
  binanceQrUrl?: string;
  pagoMovilConfigured?: boolean;
  transferenciaConfigured?: boolean;
  whatsappMode?: boolean;
  embedded?: boolean;
  checkoutPaymentMethods: CheckoutPaymentMethodDto[];
  subtotalUsd: number;
  exchangeRateUsdBs?: number;
  shippingMethod?: string | null;
}

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

/**
 * Espejo cliente del master switch (Fase 6). Ver `lib/cashea-config.ts` para
 * la validación completa server-side; aquí solo se usa para copy/UI.
 *
 * NOTA (alcance de Fase 6): el flujo automático con el SDK solo está montado
 * en `CheckoutFlow`/`ReviewStep` (canal `full`). `WhatsAppCheckout.tsx`
 * (canal `whatsapp`) sigue en modo manual — no prometer el botón de Cashea
 * cuando `whatsappMode` es true hasta que ese componente también se integre.
 */
const CASHEA_AUTOMATIC_ENABLED = process.env.NEXT_PUBLIC_CASHEA_ENABLED === 'true';

const selectCls =
  'block w-full min-h-[48px] px-3.5 text-base bg-slate-50/70 border border-slate-200 rounded-xl text-navy focus:outline-none focus:bg-white focus:border-navy';

function methodIcon(kind: CheckoutPaymentMethodDto['kind']) {
  switch (kind) {
    case 'PAGO_MOVIL':
      return Phone;
    case 'BANK_TRANSFER':
      return Building;
    case 'CASH_FOREIGN_CURRENCY':
      return Banknote;
    default:
      return Wallet;
  }
}

const PaymentForm = forwardRef<PaymentFormHandle, PaymentFormProps>(({
  onPaymentSubmit,
  onSelectedMethodChange,
  initialData,
  pagoMovil,
  transferencia,
  binancePayId = '',
  binanceQrUrl = '',
  whatsappMode = false,
  embedded = false,
  checkoutPaymentMethods,
  shippingMethod = null,
}, ref) => {
  const prefersReduced = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(initialData?.paymentMethodId ?? null);
  const [paymentCurrency, setPaymentCurrency] = useState<string | null>(initialData?.paymentCurrency ?? null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [bank, setBank] = useState(initialData?.bank && initialData.bank !== 'Binance' ? initialData.bank : '');
  const [holderIdNumber, setHolderIdNumber] = useState(initialData?.holderIdNumber ?? '');
  const [holderPhone, setHolderPhone] = useState(initialData?.holderPhone ?? '');
  const [referenceNumber, setReferenceNumber] = useState(initialData?.referenceNumber ?? '');
  const [proofFile, setProofFile] = useState<File | null>(initialData?.proofFile ?? null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState(initialData?.proofPreviewUrl ?? '');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [normalizingProof, setNormalizingProof] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'paymentMethodId' | 'bank' | 'holderIdNumber' | 'holderPhone' | 'referenceNumber' | 'proofFile' | 'paymentCurrency', string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const visibleMethods = useMemo(() => {
    return checkoutPaymentMethods.filter((m) => {
      if (
        !whatsappMode &&
        m.fullDeliveryScope === 'STORE_PICKUP_ONLY' &&
        shippingMethod !== 'tienda'
      ) {
        return false;
      }
      return true;
    });
  }, [checkoutPaymentMethods, whatsappMode, shippingMethod]);

  const vesMethods = useMemo(
    () => visibleMethods.filter((m) => m.currencyGroup === 'VES'),
    [visibleMethods],
  );
  const usdMethods = useMemo(
    () => visibleMethods.filter((m) => m.currencyGroup === 'USD'),
    [visibleMethods],
  );

  const resolveInitialGroup = useCallback((): PaymentCurrencyGroup => {
    const initialId = initialData?.paymentMethodId;
    if (initialId) {
      const fromInitial = visibleMethods.find((m) => m.id === initialId);
      if (fromInitial) return fromInitial.currencyGroup;
    }
    if (vesMethods.length > 0) return 'VES';
    return 'USD';
  }, [initialData?.paymentMethodId, visibleMethods, vesMethods.length]);

  const [currencyGroup, setCurrencyGroup] = useState<PaymentCurrencyGroup>(resolveInitialGroup);

  const groupMethods = currencyGroup === 'VES' ? vesMethods : usdMethods;
  const availableIds = useMemo(() => new Set(visibleMethods.map((m) => m.id)), [visibleMethods]);
  const selectedMethod = visibleMethods.find((m) => m.id === selected) ?? null;

  const clearProof = useCallback(() => {
    setProofFile(null);
    setProofPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }, []);

  const clearMethodSelection = useCallback(() => {
    setSelected(null);
    setPaymentCurrency(null);
    setErrors({});
    setReferenceNumber('');
    clearProof();
  }, [clearProof]);

  const selectCurrencyGroup = (next: PaymentCurrencyGroup) => {
    if (next === currencyGroup) return;
    setCurrencyGroup(next);
    if (selectedMethod && selectedMethod.currencyGroup !== next) {
      clearMethodSelection();
    }
  };

  // Reconstruir grupo al volver desde Review con un método ya elegido.
  useEffect(() => {
    const initialId = initialData?.paymentMethodId;
    if (!initialId) return;
    const m = visibleMethods.find((x) => x.id === initialId);
    if (m) setCurrencyGroup(m.currencyGroup);
  }, [initialData?.paymentMethodId, visibleMethods]);

  // Si el grupo activo pierde todos sus métodos, saltar al primero disponible.
  useEffect(() => {
    if (groupMethods.length > 0) return;
    if (vesMethods.length > 0) {
      setCurrencyGroup('VES');
      return;
    }
    if (usdMethods.length > 0) {
      setCurrencyGroup('USD');
    }
  }, [groupMethods.length, vesMethods.length, usdMethods.length]);

  useEffect(() => {
    if (selected && !availableIds.has(selected)) {
      clearMethodSelection();
    }
  }, [selected, availableIds, clearMethodSelection]);

  useEffect(() => {
    if (!selectedMethod) return;
    if (selectedMethod.acceptedCurrencies.length === 0) {
      setPaymentCurrency(null);
      return;
    }
    if (selectedMethod.acceptedCurrencies.length === 1) {
      const only = selectedMethod.acceptedCurrencies[0] ?? null;
      if (paymentCurrency !== only) {
        setPaymentCurrency(only);
      }
      return;
    }
    if (paymentCurrency && !selectedMethod.acceptedCurrencies.includes(paymentCurrency)) {
      setPaymentCurrency(null);
    }
  }, [selectedMethod, paymentCurrency]);

  useEffect(() => {
    onSelectedMethodChange?.(selectedMethod);
  }, [selectedMethod, onSelectedMethodChange]);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopiedField(value);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const selectProof = useCallback(async (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith('image/') && !isHeicFile(file)) {
      setUploadError('El comprobante debe ser una imagen (JPG, PNG, WEBP o HEIC).');
      return;
    }
    setNormalizingProof(true);
    try {
      const normalized = await normalizeImageForUpload(file, { maxOutputBytes: MAX_PROOF_BYTES });
      setProofFile(normalized);
      setProofPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(normalized);
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No pudimos procesar la imagen.');
    } finally {
      setNormalizingProof(false);
    }
  }, []);

  const needsCurrency = Boolean(
    selectedMethod &&
      (selectedMethod.kind === 'CASH_FOREIGN_CURRENCY' ||
        selectedMethod.acceptedCurrencies.length > 0),
  );

  const needsWhatsappCoordination = Boolean(
    whatsappMode &&
      selectedMethod &&
      (selectedMethod.kind === 'PAGO_MOVIL' ||
        selectedMethod.kind === 'BANK_TRANSFER' ||
        selectedMethod.kind === 'BINANCE' ||
        (selectedMethod.kind === 'ZELLE' && !selectedMethod.recipientValue.trim()) ||
        (selectedMethod.kind === 'CUSTOM_FOREIGN_CURRENCY' &&
          !selectedMethod.recipientValue.trim())),
  );

  const buildPaymentData = (): PaymentFormData => {
    const kind = selectedMethod?.kind;
    if (whatsappMode) {
      return {
        paymentMethodId: selected!,
        paymentCurrency: needsCurrency ? paymentCurrency : null,
        bank: kind === 'PAGO_MOVIL' || kind === 'BANK_TRANSFER' ? bank : '',
        holderIdNumber: '',
        holderPhone: '',
        referenceNumber: '',
        proofFile: null,
        proofPreviewUrl: '',
      };
    }
    if (kind === 'CASHEA') {
      return {
        paymentMethodId: selected!,
        paymentCurrency: null,
        bank: '',
        holderIdNumber: '',
        holderPhone: '',
        referenceNumber: '',
        proofFile: null,
        proofPreviewUrl: '',
      };
    }
    if (kind === 'BINANCE') {
      return {
        paymentMethodId: selected!,
        paymentCurrency: null,
        bank: 'Binance',
        holderIdNumber: '',
        holderPhone: '',
        referenceNumber,
        proofFile,
        proofPreviewUrl,
      };
    }
    if (kind === 'CASH_FOREIGN_CURRENCY' || kind === 'ZELLE' || kind === 'CUSTOM_FOREIGN_CURRENCY') {
      return {
        paymentMethodId: selected!,
        paymentCurrency: needsCurrency ? paymentCurrency : null,
        bank: '',
        holderIdNumber: '',
        holderPhone: '',
        referenceNumber,
        proofFile,
        proofPreviewUrl,
      };
    }
    return {
      paymentMethodId: selected!,
      paymentCurrency: null,
      bank,
      holderIdNumber,
      holderPhone,
      referenceNumber,
      proofFile,
      proofPreviewUrl,
    };
  };

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!selected || !selectedMethod) {
      e.paymentMethodId = 'Selecciona un método de pago.';
      setErrors(e);
      return false;
    }

    if (needsCurrency && !paymentCurrency) {
      e.paymentCurrency = 'Selecciona la moneda del pago.';
    }

    if (whatsappMode) {
      setErrors(e);
      return Object.keys(e).length === 0;
    }

    const kind = selectedMethod.kind;
    if (kind === 'CASHEA') {
      setErrors(e);
      return Object.keys(e).length === 0;
    }

    if (kind === 'PAGO_MOVIL' || kind === 'BANK_TRANSFER') {
      if (!bank) e.bank = 'Selecciona tu banco.';
      if (!holderIdNumber.trim()) e.holderIdNumber = 'Ingresa la cédula del titular.';
      if (!holderPhone.trim()) e.holderPhone = 'Ingresa el teléfono.';
    }

    if (selectedMethod.requireReferenceInFull && !referenceNumber.trim()) {
      e.referenceNumber =
        kind === 'BINANCE'
          ? 'Ingresa el Order ID o referencia que muestra Binance.'
          : 'Ingresa el número de referencia.';
    }
    if (selectedMethod.requireProofInFull && !proofFile) {
      e.proofFile =
        kind === 'BINANCE'
          ? 'Sube la captura de pantalla del pago.'
          : 'Sube el comprobante de pago.';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  useImperativeHandle(ref, () => ({
    submit: () => (validate() && selected ? buildPaymentData() : null),
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !selected) return;
    onPaymentSubmit(buildPaymentData());
  };

  const isBankManual =
    selectedMethod?.kind === 'PAGO_MOVIL' || selectedMethod?.kind === 'BANK_TRANSFER';

  const storeDataRows: { label: string; value: string }[] | null = (() => {
    if (!selectedMethod || whatsappMode) return null;
    if (selectedMethod.kind === 'PAGO_MOVIL') {
      return [
        { label: 'Banco', value: pagoMovil.bank },
        { label: 'Teléfono', value: pagoMovil.phone },
        { label: 'Cédula', value: pagoMovil.idNumber },
      ];
    }
    if (selectedMethod.kind === 'BANK_TRANSFER') {
      return [
        { label: 'Banco', value: transferencia.bank },
        { label: 'Cuenta', value: transferencia.accountNumber },
        { label: 'Titular', value: transferencia.accountHolder },
        { label: 'RIF', value: transferencia.rif },
      ];
    }
    return null;
  })();

  const renderProofUploader = (label: string) => (
    <div>
      <p className="text-sm font-semibold text-navy mb-2">
        {label} <span className="text-rose-500">*</span>
      </p>
      <input
        ref={fileRef}
        type="file"
        accept={PROOF_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void selectProof(file);
          e.target.value = '';
        }}
      />
      {proofPreviewUrl ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proofPreviewUrl}
            alt="Comprobante"
            loading="lazy"
            decoding="async"
            className="w-40 h-40 object-cover rounded-xl border border-slate-200 shadow-soft"
          />
          <button
            type="button"
            onClick={clearProof}
            className="absolute -top-4 -right-4 w-11 h-11 flex items-center justify-center"
            aria-label="Eliminar comprobante"
          >
            <span className="w-7 h-7 bg-rose-600 text-white rounded-full flex items-center justify-center hover:bg-rose-700 transition-colors shadow">
              <X size={14} />
            </span>
          </button>
          <p className="mt-1.5 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
            <Check size={11} /> Listo — se envía al confirmar el pedido
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={normalizingProof}
          className="w-full flex items-center justify-center gap-2 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-navy/40 hover:bg-slate-100 rounded-xl py-5 text-sm font-medium text-slate-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <UploadCloud size={16} /> {normalizingProof ? 'Preparando imagen…' : 'Subir comprobante'}
        </button>
      )}
      {uploadError && <p className="mt-1.5 text-xs text-rose-700">{uploadError}</p>}
      {errors.proofFile && !proofFile && (
        <p className="mt-1.5 text-xs text-rose-700">{errors.proofFile}</p>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div>
        <h2 className="text-xl font-semibold text-navy tracking-tight">Método de pago</h2>
        <p className="text-sm text-slate-500 mt-1">
          {whatsappMode
            ? 'Selecciona cómo vas a pagar. No necesitas subir comprobante ahora — lo coordinas por WhatsApp.'
            : 'Selecciona cómo vas a pagar y completa los datos requeridos.'}
        </p>
      </div>

      {visibleMethods.length > 0 ? (
        <div className="space-y-4">
          {(vesMethods.length > 0 || usdMethods.length > 0) && (
            <div
              role="tablist"
              aria-label="Moneda o tipo de pago"
              className="inline-flex w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1"
            >
              {vesMethods.length > 0 && (
                <button
                  type="button"
                  role="tab"
                  id="payment-group-ves"
                  aria-selected={currencyGroup === 'VES'}
                  aria-controls="payment-group-ves-panel"
                  onClick={() => selectCurrencyGroup('VES')}
                  className={`flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
                    currencyGroup === 'VES'
                      ? 'bg-white text-navy shadow-soft'
                      : 'text-slate-600 hover:text-navy'
                  }`}
                >
                  Bolívares
                </button>
              )}
              {usdMethods.length > 0 && (
                <button
                  type="button"
                  role="tab"
                  id="payment-group-usd"
                  aria-selected={currencyGroup === 'USD'}
                  aria-controls="payment-group-usd-panel"
                  onClick={() => selectCurrencyGroup('USD')}
                  className={`flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
                    currencyGroup === 'USD'
                      ? 'bg-white text-navy shadow-soft'
                      : 'text-slate-600 hover:text-navy'
                  }`}
                >
                  USD / divisas
                </button>
              )}
            </div>
          )}

          <div
            role="tabpanel"
            id={currencyGroup === 'VES' ? 'payment-group-ves-panel' : 'payment-group-usd-panel'}
            aria-labelledby={currencyGroup === 'VES' ? 'payment-group-ves' : 'payment-group-usd'}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {groupMethods.map((m) => {
              const Icon = methodIcon(m.kind);
              const isActive = selected === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelected(m.id);
                    setErrors({});
                    if (m.acceptedCurrencies.length === 1) {
                      setPaymentCurrency(m.acceptedCurrencies[0] ?? null);
                    } else if (m.kind !== 'CASH_FOREIGN_CURRENCY' && m.acceptedCurrencies.length === 0) {
                      setPaymentCurrency(null);
                    }
                  }}
                  className={`text-left rounded-2xl p-4 flex items-start gap-3 transition-all ${
                    isActive
                      ? 'border-2 border-navy bg-slate-50 shadow-soft'
                      : 'border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isActive ? 'bg-navy text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Icon size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">{m.name}</p>
                    {m.description ? (
                      <p className="text-[12px] text-slate-500 mt-0.5">{m.description}</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            No hay métodos de pago disponibles en este momento. Contáctanos para completar tu compra.
          </p>
        </div>
      )}
      {errors.paymentMethodId && (
        <p className="text-xs text-rose-700 -mt-4">{errors.paymentMethodId}</p>
      )}

      {!whatsappMode && storeDataRows && isBankManual && (
        <motion.div
          key={selectedMethod?.id}
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReduced ? reducedTransition : { duration: 0.22 }}
          className="bg-navy/5 border border-navy/10 rounded-2xl p-5"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Transfiere a estos datos de MundoTech
          </p>
          <dl className="space-y-2">
            {storeDataRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                <dt className="text-slate-500 shrink-0">{row.label}</dt>
                <dd className="flex items-center gap-1 font-mono text-navy text-[13px] text-right">
                  {row.value}
                  <button
                    type="button"
                    onClick={() => handleCopy(row.value)}
                    className="min-w-[44px] min-h-[44px] -my-3 -mr-2 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-400 hover:text-navy transition-colors"
                    aria-label={`Copiar ${row.label}`}
                  >
                    {copiedField === row.value
                      ? <Check size={14} className="text-emerald-500" />
                      : <Copy size={14} />}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </motion.div>
      )}

      {needsWhatsappCoordination && selectedMethod && (
        <p className="text-[12px] text-slate-600 leading-relaxed rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5">
          Coordinaremos los datos para pagar por {selectedMethod.name} contigo por WhatsApp al
          confirmar el pedido.
        </p>
      )}

      {whatsappMode && selectedMethod?.kind === 'CASH_FOREIGN_CURRENCY' && (
        <p className="text-[12px] text-slate-600 leading-relaxed rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5">
          Indica con qué moneda pagarás. Coordinaremos el resto por WhatsApp al confirmar el pedido.
        </p>
      )}

      <AnimatePresence mode="wait">
        {selectedMethod?.kind === 'BINANCE' && !whatsappMode && (
          <motion.div
            key="binance-panel"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={prefersReduced ? reducedTransition : { duration: 0.22 }}
            className="rounded-2xl border border-[#F0B90B]/50 bg-gradient-to-br from-amber-50/90 to-white p-5 space-y-4"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Paga a MundoTech en Binance
              </p>
              {binancePayId.trim() ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <p className="text-[11px] text-slate-500">Binance ID / Pay ID</p>
                    <p className="font-mono text-sm font-semibold text-navy break-all">{binancePayId.trim()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(binancePayId.trim())}
                    className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"
                    aria-label="Copiar Binance ID"
                  >
                    {copiedField === binancePayId.trim() ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              ) : null}
              {binanceQrUrl.trim() ? (
                <div className="mt-3 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={binanceQrUrl.trim()}
                    alt="Código QR Binance MundoTech"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    className="w-36 h-36 rounded-xl border border-slate-200 bg-white object-contain"
                  />
                </div>
              ) : null}
            </div>
            {selectedMethod.requireReferenceInFull && (
              <Field id="binanceReference" label="Order ID / referencia en Binance" error={errors.referenceNumber}>
                <Input
                  id="binanceReference"
                  placeholder="Ej. orden mostrada en historial o comprobante"
                  autoComplete="off"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  invalid={!!errors.referenceNumber}
                />
              </Field>
            )}
            {selectedMethod.requireProofInFull && renderProofUploader('Captura del pago')}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {selectedMethod?.kind === 'ZELLE' && (
          <motion.div
            key="zelle-panel"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={prefersReduced ? reducedTransition : { duration: 0.22 }}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Zelle</p>
            {selectedMethod.recipientLabel && selectedMethod.recipientValue && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-[11px] text-slate-500">{selectedMethod.recipientLabel}</p>
                  <p className="font-mono text-sm font-semibold text-navy break-all">{selectedMethod.recipientValue}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(selectedMethod.recipientValue)}
                  className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"
                  aria-label="Copiar destinatario Zelle"
                >
                  {copiedField === selectedMethod.recipientValue ? (
                    <Check size={14} className="text-emerald-500" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            )}
            {selectedMethod.instructions && (
              <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedMethod.instructions}</p>
            )}
            {whatsappMode && (
              <p className="text-[12px] text-slate-500">La referencia y el comprobante se coordinan por WhatsApp.</p>
            )}
            {!whatsappMode && selectedMethod.requireReferenceInFull && (
              <Field id="zelleReference" label="Número de referencia" error={errors.referenceNumber}>
                <Input
                  id="zelleReference"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  invalid={!!errors.referenceNumber}
                />
              </Field>
            )}
            {!whatsappMode && selectedMethod.requireProofInFull && renderProofUploader('Comprobante de pago')}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {selectedMethod?.kind === 'CASH_FOREIGN_CURRENCY' && (
          <motion.div
            key="cash-panel"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={prefersReduced ? reducedTransition : { duration: 0.22 }}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Efectivo en divisas</p>
            {selectedMethod.fullDeliveryScope === 'STORE_PICKUP_ONLY' && !whatsappMode && (
              <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                En modo Full este método solo aparecerá para retiro en tienda.
              </p>
            )}
            {selectedMethod.acceptedCurrencies.length === 1 ? (
              <div>
                <p className="text-sm font-medium text-navy mb-1">Moneda de pago</p>
                <p className="text-sm font-semibold text-navy nums" aria-live="polite">
                  {selectedMethod.acceptedCurrencies[0]}
                </p>
                {errors.paymentCurrency && (
                  <p className="mt-1.5 text-xs text-rose-700">{errors.paymentCurrency}</p>
                )}
              </div>
            ) : (
              <Field id="cashCurrency" label="Moneda" error={errors.paymentCurrency}>
                <select
                  id="cashCurrency"
                  value={paymentCurrency ?? ''}
                  onChange={(e) => setPaymentCurrency(e.target.value || null)}
                  className={selectCls}
                >
                  <option value="">Selecciona moneda…</option>
                  {selectedMethod.acceptedCurrencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            )}
            {selectedMethod.instructions && (
              <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedMethod.instructions}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {selectedMethod?.kind === 'CUSTOM_FOREIGN_CURRENCY' && (
          <motion.div
            key="custom-panel"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={prefersReduced ? reducedTransition : { duration: 0.22 }}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{selectedMethod.name}</p>
            {selectedMethod.recipientLabel && selectedMethod.recipientValue && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] text-slate-500">{selectedMethod.recipientLabel}</p>
                <p className="font-mono text-sm font-semibold text-navy break-all">{selectedMethod.recipientValue}</p>
              </div>
            )}
            {selectedMethod.instructions && (
              <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedMethod.instructions}</p>
            )}
            {selectedMethod.acceptedCurrencies.length > 0 && (
              <Field id="customCurrency" label="Moneda" error={errors.paymentCurrency}>
                <select
                  id="customCurrency"
                  value={paymentCurrency ?? ''}
                  onChange={(e) => setPaymentCurrency(e.target.value || null)}
                  className={selectCls}
                >
                  <option value="">Selecciona moneda…</option>
                  {selectedMethod.acceptedCurrencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            )}
            {!whatsappMode && selectedMethod.requireReferenceInFull && (
              <Field id="customReference" label="Número de referencia" error={errors.referenceNumber}>
                <Input
                  id="customReference"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  invalid={!!errors.referenceNumber}
                />
              </Field>
            )}
            {!whatsappMode && selectedMethod.requireProofInFull && renderProofUploader('Comprobante de pago')}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {selectedMethod?.kind === 'CASHEA' && (
          <motion.div
            key="cashea-panel"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={prefersReduced ? reducedTransition : { duration: 0.22 }}
            className="rounded-2xl border border-navy/20 bg-navy/5 p-5 space-y-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Paga con Cashea
            </p>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              {CASHEA_AUTOMATIC_ENABLED && !whatsappMode
                ? 'Al confirmar tu pedido serás dirigido a Cashea para completar tu compra. Reservamos tu pedido y, en cuanto verifiquemos tu pago inicial, preparamos tu envío. No necesitas subir comprobante aquí.'
                : 'Al confirmar tu pedido te mostraremos un botón para escribirnos por WhatsApp. Por ahí coordinamos tu compra con Cashea: generamos tu orden, pagas la inicial en tu app Cashea y, al confirmar el pago, preparamos tu envío. No necesitas subir comprobante aquí.'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {isBankManual && !whatsappMode && (
        <motion.div
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReduced ? reducedTransition : { duration: 0.25 }}
          className="space-y-5"
        >
          <div className="border-t border-slate-100 pt-6">
            <h3 className="text-sm font-semibold text-navy mb-4">Datos de tu transferencia</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <Field id="bank" label="Banco desde donde transferiste" error={errors.bank}>
                  <select
                    id="bank"
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Selecciona tu banco…</option>
                    {VENEZUELAN_BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field id="holderIdNumber" label="Cédula del titular de la cuenta" error={errors.holderIdNumber}>
                <Input
                  id="holderIdNumber"
                  placeholder="V-12345678"
                  autoComplete="off"
                  value={holderIdNumber}
                  onChange={(e) => setHolderIdNumber(e.target.value)}
                  invalid={!!errors.holderIdNumber}
                />
              </Field>
              <Field id="holderPhone" label="Teléfono del titular" error={errors.holderPhone}>
                <Input
                  id="holderPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0412-0000000"
                  value={holderPhone}
                  onChange={(e) => setHolderPhone(e.target.value)}
                  invalid={!!errors.holderPhone}
                />
              </Field>
              {selectedMethod?.requireReferenceInFull && (
                <div className="sm:col-span-2">
                  <Field id="referenceNumber" label="Número de referencia de la operación" error={errors.referenceNumber}>
                    <Input
                      id="referenceNumber"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Ej. 009432871"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      invalid={!!errors.referenceNumber}
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>
          {selectedMethod?.requireProofInFull && renderProofUploader('Comprobante de pago')}
        </motion.div>
      )}

      {!embedded && (
        <div
          className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 bg-white/95 backdrop-blur-sm border-t border-slate-100 sm:static sm:mx-0 sm:px-0 sm:pb-0 sm:pt-0 sm:border-0 sm:bg-transparent sm:backdrop-blur-none"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="submit"
            disabled={!selected || visibleMethods.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 bg-brand-yellow text-navy font-bold text-sm min-h-[52px] rounded-2xl hover:bg-[#FFE03A] active:scale-[0.98] shadow-soft hover:shadow-card transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Revisar pedido <ChevronRight size={16} />
          </button>
        </div>
      )}
    </form>
  );
});

PaymentForm.displayName = 'PaymentForm';
export default PaymentForm;
