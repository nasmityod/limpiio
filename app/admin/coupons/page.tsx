'use client';

import { useAdminDialog } from '@/hooks/useAdminDialog';

import { useEffect, useState, useTransition, useCallback, useRef } from 'react';
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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const requestSeq = useRef(0);
  const busyIds = useRef(new Set<string>());

  const fetchCoupons = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '25', q: query.trim(), status });
      const res = await fetch(`/api/coupons?${qs}`);
      if (!res.ok) throw new Error('No se pudieron cargar los cupones.');
      const data = await res.json();
      if (seq !== requestSeq.current) return;
      setCoupons(data.items); setTotal(data.total);
      if (data.items.length === 0 && page > 1) setPage(p => Math.max(1, p - 1));
    } catch {
      if (seq === requestSeq.current) setFeedback({ type: 'error', msg: 'No se pudieron cargar los cupones. Vuelve a intentarlo.' });
    } finally { if (seq === requestSeq.current) setLoading(false); }
  }, [page, query, status]);

  useEffect(() => { const timer = setTimeout(() => void fetchCoupons(), 250); return () => { clearTimeout(timer); }; }, [fetchCoupons]);

  const flash = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    if (type === 'success') setTimeout(() => setFeedback(current => current?.type === 'success' ? null : current), 3500);
  };

  const handleDelete = async (c: Coupon) => {
    if (busyIds.current.has(c.id)) return;
    const warning = `El cupón "${c.code}" se desactivará conservando su código y el historial de usos. ¿Continuar?`;
    if (!confirm(warning)) return;
    busyIds.current.add(c.id);
    try {
    const res = await fetch(`/api/coupons/${c.id}`, { method: 'DELETE' });
    if (res.ok) { flash('success', 'Cupón desactivado; historial conservado.'); fetchCoupons(); }
    else flash('error', 'No se pudo eliminar.');
    } catch { flash('error', 'Error de conexión. El estado no se pudo confirmar.'); }
    finally { busyIds.current.delete(c.id); }
  };

  const handleToggleActive = async (c: Coupon) => {
    if (busyIds.current.has(c.id)) return;
    // PRD-244 / RUN-14 (cerrado): PATCH parcial atómico — solo viaja { active },
    // imposible pisar la edición concurrente de otro admin.
    busyIds.current.add(c.id);
    try {
    const res = await fetch(`/api/coupons/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !c.active }),
    });
    if (res.ok) { flash('success', c.active ? 'Cupón desactivado.' : 'Cupón activado.'); fetchCoupons(); }
    else flash('error', 'No se pudo actualizar.');
    } catch { flash('error', 'Error de conexión. El estado no se pudo confirmar.'); }
    finally { busyIds.current.delete(c.id); }
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
              {loading ? '…' : `${total} cupones. Descuentos con fecha de expiración y límite de usos.`}
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

      <div className="flex flex-wrap gap-3">
        <input aria-label="Buscar cupones" maxLength={100} value={query} onChange={e => { ++requestSeq.current; setQuery(e.target.value); setPage(1); }} placeholder="Buscar código o descripción" className="min-h-[44px] rounded-xl border px-3" />
        <select aria-label="Estado del cupón" value={status} onChange={e => { ++requestSeq.current; setStatus(e.target.value); setPage(1); }} className="min-h-[44px] rounded-xl border px-3">
          <option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="expired">Expirados</option>
        </select>
        <button type="button" onClick={() => void fetchCoupons()} disabled={loading} className="min-h-[44px] rounded-xl border px-3">Actualizar</button>
      </div>

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

      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={loading || page <= 1} onClick={() => { ++requestSeq.current; setPage(p => p - 1); }} className="min-h-[44px] border rounded-xl px-3 disabled:opacity-40">Anterior</button>
        <span className="text-sm">Página {page} de {Math.max(1, Math.ceil(total / 25))} · {total} cupones</span>
        <button type="button" disabled={loading || page * 25 >= total} onClick={() => { ++requestSeq.current; setPage(p => p + 1); }} className="min-h-[44px] border rounded-xl px-3 disabled:opacity-40">Siguiente</button>
      </div>

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

  const [dialogError, setDialogError] = useState('');
  const showError = (message: string) => { setDialogError(message); onError(message); };

  const submit = () => {
    const value = Number(discountValue);
    if (!code.trim()) { showError('El código es obligatorio.'); return; }
    if (!Number.isFinite(value) || value <= 0) { showError('El valor del descuento debe ser mayor que 0.'); return; }
    if (discountType === 'PERCENT' && value > 100) { showError('El porcentaje no puede superar 100%.'); return; }

    if ([startsAt, expiresAt].some(v => v && !Number.isFinite(Date.parse(v)))) { showError('La fecha no es válida.'); return; }
    const payload = {
      code: code.trim().toUpperCase(),
      description: description.trim() || null,
      discountType,
      discountValue: value,
      minPurchase: minPurchase === '' ? 0 : Number(minPurchase),
      maxDiscount: maxDiscount === '' ? null : Number(maxDiscount),
      maxUses: maxUses === '' ? null : Number(maxUses),
      perUserLimit: perUserLimit === '' ? null : Number(perUserLimit),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      active,
    };

    startTransition(async () => {
      try {
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
        showError(typeof err.error === 'string' ? err.error : 'No se pudo guardar el cupón.');
      }
      } catch { showError('Error de conexión al guardar cupón. Tus cambios se conservan.'); }
    });
  };

  const inputClass =
    'w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy';
  const labelClass = 'block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5';

  const { dialogRef, close } = useAdminDialog(onClose, true, pending);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Cupón" className="fixed inset-0 z-50 flex sm:items-center sm:justify-center" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div
        className="relative z-10 w-full sm:w-[480px] sm:max-w-[92vw] sm:my-6 bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-screen max-h-[100dvh] sm:max-h-[88vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="sticky top-0 bg-white sm:rounded-t-2xl border-b border-gray-100 px-4 py-3.5 flex items-center justify-between gap-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.875rem)' }}>
          <h2 className="text-base font-black text-navy truncate">
            {coupon ? 'Editar cupón' : 'Nuevo cupón'}
          </h2>
          <button type="button" onClick={close} aria-label="Cerrar" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </header>

        <div inert={pending} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {dialogError && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{dialogError}</p>}
          <div>
            <label htmlFor="coupon-code" className={labelClass}>Código</label>
            <input id="coupon-code"
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              autoFocus={!coupon}
              placeholder="EJ: BIENVENIDO10"
              className={`${inputClass} font-mono uppercase tracking-wide`}
            />
          </div>

          <div>
            <label htmlFor="coupon-description" className={labelClass}>
              Descripción <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional, uso interno</span>
            </label>
            <input id="coupon-description"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Descuento de bienvenida"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="coupon-percent" className={labelClass}>Tipo de descuento</label>
            <div className="grid grid-cols-2 gap-2">
              <button id="coupon-percent" aria-pressed={discountType === 'PERCENT'}
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
                aria-pressed={discountType === 'FIXED'}
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
              <label htmlFor="coupon-discountValue" className={labelClass}>
                {discountType === 'PERCENT' ? 'Porcentaje' : 'Monto (USD)'}
              </label>
              <input id="coupon-discountValue"
                type="number"
                inputMode="decimal"
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                placeholder={discountType === 'PERCENT' ? '10' : '5.00'}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="coupon-minPurchase" className={labelClass}>
                Compra mínima (USD)
              </label>
              <input id="coupon-minPurchase"
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
              <label htmlFor="coupon-maxDiscount" className={labelClass}>
                Descuento máximo (USD) <span className="text-[10px] font-medium text-gray-400 normal-case">— tope opcional</span>
              </label>
              <input id="coupon-maxDiscount"
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
              <label htmlFor="coupon-maxUses" className={labelClass}>
                Usos totales <span className="text-[10px] font-medium text-gray-400 normal-case">— vacío = ilimitado</span>
              </label>
              <input id="coupon-maxUses"
                type="number"
                inputMode="numeric"
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
                placeholder="Ilimitado"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="coupon-perUserLimit" className={labelClass}>
                Usos por usuario <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional</span>
              </label>
              <input id="coupon-perUserLimit"
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
              <label htmlFor="coupon-startsAt" className={labelClass}>Válido desde <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional</span></label>
              <input id="coupon-startsAt"
                type="datetime-local"
                value={startsAt}
                onChange={e => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="coupon-expiresAt" className={labelClass}>Expira el <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional</span></label>
              <input id="coupon-expiresAt"
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
          <button type="button" onClick={close} disabled={pending} className="flex-1 min-h-[52px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-100">
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
