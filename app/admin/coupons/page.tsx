'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Ticket, Plus, Edit, Trash2, Check, X, Loader2, AlertCircle, Power,
} from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/admin/DataTable';
import { TouchIconButton } from '@/components/admin/TouchIconButton';
import type { Coupon, CouponDiscountType } from '@/lib/definitions';

/** Convierte un ISO a valor para <input type="datetime-local"> (hora local). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isExpired(c: Coupon): boolean {
  return !!c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
}

function discountLabel(c: Coupon): string {
  return c.discountType === 'PERCENT'
    ? `${c.discountValue}%`
    : `$${c.discountValue.toFixed(2)}`;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  /** El endpoint acota el listado; si hay más se avisa en vez de ocultarlo. */
  const [truncatedTotal, setTruncatedTotal] = useState<number | null>(null);

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/coupons');
      if (res.ok) {
        const rows = (await res.json()) as Coupon[];
        setCoupons(rows);
        setTruncatedTotal(
          res.headers.get('X-Truncated') === '1'
            ? Number(res.headers.get('X-Total-Count') ?? 0)
            : null,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCoupons(); }, []);

  const flash = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleDelete = async (c: Coupon) => {
    // PRD-245: con usos registrados, borrar deja Order.couponCode huérfano
    // (PRD-158 → 02). Advertencia explícita de pérdida de historial; la
    // alternativa segura recomendada es desactivar.
    const warning = c.usedCount > 0
      ? `El cupón "${c.code}" ya fue usado en ${c.usedCount} pedido${c.usedCount !== 1 ? 's' : ''}.\n\nAl eliminarlo, esos pedidos conservarán el código pero se perderá el registro del cupón (historial/auditoría). Si solo quieres que deje de funcionar, usa «Desactivar».\n\n¿Eliminar de todas formas?`
      : `¿Eliminar el cupón "${c.code}"? Esta acción no se puede deshacer.`;
    if (!confirm(warning)) return;
    const res = await fetch(`/api/coupons/${c.id}`, { method: 'DELETE' });
    if (res.ok) { flash('success', 'Cupón eliminado.'); fetchCoupons(); }
    else flash('error', 'No se pudo eliminar.');
  };

  const handleToggleActive = async (c: Coupon) => {
    // PRD-244 / RUN-14 (cerrado): PATCH parcial atómico — solo viaja { active },
    // imposible pisar la edición concurrente de otro admin.
    const res = await fetch(`/api/coupons/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !c.active }),
    });
    if (res.ok) { flash('success', c.active ? 'Cupón desactivado.' : 'Cupón activado.'); fetchCoupons(); }
    else flash('error', 'No se pudo actualizar.');
  };

  const columns: DataTableColumn<Coupon>[] = [
    {
      key: 'code', header: 'Código', primary: true,
      cell: c => <span className="font-mono font-bold text-navy">{c.code}</span>,
    },
    {
      key: 'discount', header: 'Descuento', mobileLabel: 'Descuento', align: 'right',
      cell: c => <span className="font-mono text-sm text-navy font-semibold">{discountLabel(c)}</span>,
    },
    {
      key: 'uses', header: 'Usos', mobileLabel: 'Usos', align: 'right',
      cell: c => (
        <span className="font-mono text-sm text-gray-600">
          {c.usedCount}{c.maxUses != null ? `/${c.maxUses}` : ''}
        </span>
      ),
    },
    {
      key: 'expiresAt', header: 'Expira', mobileLabel: 'Expira',
      cell: c => (
        <span className={`text-[12px] ${isExpired(c) ? 'text-rose-600 font-semibold' : 'text-gray-500'}`}>
          {isExpired(c) ? 'Expirado' : formatDate(c.expiresAt)}
        </span>
      ),
    },
    {
      key: 'status', header: 'Estado', mobileLabel: 'Estado',
      cell: c => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
          c.active && !isExpired(c)
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-gray-100 text-gray-500 border border-gray-200'
        }`}>
          {c.active && !isExpired(c) ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-amber-50 text-navy flex items-center justify-center">
            <Ticket size={22} />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-navy">Cupones</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading ? '…' : `${coupons.length} cupones. Descuentos con fecha de expiración y límite de usos.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="min-h-[48px] inline-flex items-center justify-center gap-1.5 px-4 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase tracking-wide rounded-xl active:bg-yellow-300"
        >
          <Plus size={16} /> Nuevo
        </button>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          feedback.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <Check size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {truncatedTotal != null && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-800">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            Se muestran los {coupons.length} cupones más recientes de {truncatedTotal}.
            Archiva los que ya no uses para mantener la lista manejable.
          </span>
        </div>
      )}

      <DataTable<Coupon>
        data={coupons}
        columns={columns}
        rowKey={c => c.id}
        loading={loading}
        emptyState="Aún no hay cupones. Crea el primero con el botón 'Nuevo'."
        actions={c => (
          <>
            <TouchIconButton
              variant="default"
              label={c.active ? 'Desactivar' : 'Activar'}
              icon={<Power size={18} />}
              onClick={() => handleToggleActive(c)}
            />
            <TouchIconButton
              variant="primary"
              label="Editar"
              icon={<Edit size={18} />}
              onClick={() => setEditing(c)}
            />
            <TouchIconButton
              variant="danger"
              label="Eliminar"
              icon={<Trash2 size={18} />}
              onClick={() => handleDelete(c)}
            />
          </>
        )}
      />

      {(creating || editing) && (
        <CouponDialog
          coupon={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={(msg) => {
            setCreating(false);
            setEditing(null);
            flash('success', msg);
            fetchCoupons();
          }}
          onError={(msg) => flash('error', msg)}
        />
      )}
    </div>
  );
}

function CouponDialog({
  coupon, onClose, onSaved, onError,
}: {
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [code, setCode] = useState(coupon?.code ?? '');
  const [description, setDescription] = useState(coupon?.description ?? '');
  const [discountType, setDiscountType] = useState<CouponDiscountType>(coupon?.discountType ?? 'PERCENT');
  const [discountValue, setDiscountValue] = useState(String(coupon?.discountValue ?? ''));
  const [minPurchase, setMinPurchase] = useState(String(coupon?.minPurchase ?? '0'));
  const [maxDiscount, setMaxDiscount] = useState(coupon?.maxDiscount != null ? String(coupon.maxDiscount) : '');
  const [maxUses, setMaxUses] = useState(coupon?.maxUses != null ? String(coupon.maxUses) : '');
  const [perUserLimit, setPerUserLimit] = useState(coupon?.perUserLimit != null ? String(coupon.perUserLimit) : '');
  const [startsAt, setStartsAt] = useState(toLocalInput(coupon?.startsAt));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(coupon?.expiresAt));
  const [active, setActive] = useState(coupon?.active ?? true);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const value = Number(discountValue);
    if (!code.trim()) { onError('El código es obligatorio.'); return; }
    if (!Number.isFinite(value) || value <= 0) { onError('El valor del descuento debe ser mayor que 0.'); return; }
    if (discountType === 'PERCENT' && value > 100) { onError('El porcentaje no puede superar 100%.'); return; }

    const payload = {
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
      discountType,
      discountValue: value,
      minPurchase: minPurchase === '' ? 0 : Number(minPurchase),
      maxDiscount: maxDiscount === '' ? null : Number(maxDiscount),
      maxUses: maxUses === '' ? null : Number(maxUses),
      perUserLimit: perUserLimit === '' ? null : Number(perUserLimit),
      startsAt: startsAt || null,
      expiresAt: expiresAt || null,
      active,
    };

    startTransition(async () => {
      const url = coupon ? `/api/coupons/${coupon.id}` : '/api/coupons';
      const method = coupon ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) onSaved(coupon ? 'Cupón actualizado.' : 'Cupón creado.');
      else {
        const err = await res.json().catch(() => ({}));
        onError(err.error ?? 'No se pudo guardar el cupón.');
      }
    });
  };

  const inputClass =
    'w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy';
  const labelClass = 'block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full sm:w-[480px] sm:max-w-[92vw] sm:my-6 bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-screen max-h-[100dvh] sm:max-h-[88vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="sticky top-0 bg-white sm:rounded-t-2xl border-b border-gray-100 px-4 py-3.5 flex items-center justify-between gap-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.875rem)' }}>
          <h2 className="text-base font-black text-navy truncate">
            {coupon ? 'Editar cupón' : 'Nuevo cupón'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className={labelClass}>Código</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              autoFocus={!coupon}
              placeholder="EJ: BIENVENIDO10"
              className={`${inputClass} font-mono uppercase tracking-wide`}
            />
          </div>

          <div>
            <label className={labelClass}>
              Descripción <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional, uso interno</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Descuento de bienvenida"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Tipo de descuento</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDiscountType('PERCENT')}
                className={`min-h-[48px] rounded-xl border text-sm font-bold transition ${
                  discountType === 'PERCENT'
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white border-gray-200 text-gray-500 active:bg-gray-100'
                }`}
              >
                Porcentaje (%)
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('FIXED')}
                className={`min-h-[48px] rounded-xl border text-sm font-bold transition ${
                  discountType === 'FIXED'
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white border-gray-200 text-gray-500 active:bg-gray-100'
                }`}
              >
                Monto fijo (USD)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                {discountType === 'PERCENT' ? 'Porcentaje' : 'Monto (USD)'}
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                placeholder={discountType === 'PERCENT' ? '10' : '5.00'}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>
                Compra mínima (USD)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={minPurchase}
                onChange={e => setMinPurchase(e.target.value)}
                placeholder="0"
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          {discountType === 'PERCENT' && (
            <div>
              <label className={labelClass}>
                Descuento máximo (USD) <span className="text-[10px] font-medium text-gray-400 normal-case">— tope opcional</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={maxDiscount}
                onChange={e => setMaxDiscount(e.target.value)}
                placeholder="Sin tope"
                className={`${inputClass} font-mono`}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Usos totales <span className="text-[10px] font-medium text-gray-400 normal-case">— vacío = ilimitado</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
                placeholder="Ilimitado"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>
                Usos por usuario <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={perUserLimit}
                onChange={e => setPerUserLimit(e.target.value)}
                placeholder="Sin límite"
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Válido desde <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional</span></label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={e => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Expira el <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional</span></label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Estado</label>
            <button
              type="button"
              onClick={() => setActive(v => !v)}
              className={`w-full min-h-[48px] rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 ${
                active
                  ? 'bg-green-50 border-green-300 text-green-800'
                  : 'bg-white border-gray-200 text-gray-500 active:bg-gray-100'
              }`}
            >
              <Power size={14} />
              {active ? 'Activo' : 'Inactivo'}
            </button>
          </div>
        </div>

        <footer className="sticky bottom-0 bg-white sm:rounded-b-2xl border-t border-gray-100 px-4 py-3 flex gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose} disabled={pending} className="flex-1 min-h-[52px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-100">
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={pending} className="flex-[2] min-h-[52px] inline-flex items-center justify-center gap-2 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase rounded-xl active:bg-yellow-300 disabled:opacity-60">
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            {coupon ? 'Guardar cambios' : 'Crear cupón'}
          </button>
        </footer>
      </div>
    </div>
  );
}
