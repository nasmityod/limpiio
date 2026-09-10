'use client';

import { OrderStatus } from '@/lib/definitions';

const validStatuses = [
  'Pendiente',
  'En Proceso',
  'Enviado',
  'Entregado',
  'Cancelado',
] as const satisfies readonly OrderStatus[];

type ButtonStatus = (typeof validStatuses)[number];

const buttonTone: Record<ButtonStatus, string> = {
  Pendiente:
    'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 active:bg-amber-200/80',
  'En Proceso':
    'border-slate-200 bg-slate-50 text-navy hover:bg-slate-100 active:bg-slate-200/80',
  Enviado: 'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 active:bg-sky-200/80',
  Entregado:
    'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 active:bg-emerald-200/80',
  Cancelado: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100 active:bg-red-200/80',
};

function confirmStatusChange(
  status: OrderStatus,
  opts: { isBulk: boolean; bulkCount?: number }
): boolean {
  if (opts.isBulk) {
    const n = opts.bulkCount ?? 0;
    if (status === 'Enviado') {
      return window.confirm(
        `¿Confirmas marcar ${n} pedido${n === 1 ? '' : 's'} como «Enviado»?\n\nEn lote no se pedirá guía MRW; puedes abrir cada pedido y completar el tracking después.`
      );
    }
    return window.confirm(
      `¿Confirmas cambiar el estado de ${n} pedido${n === 1 ? '' : 's'} a «${status}»?`
    );
  }
  const envíoHint =
    status === 'Enviado'
      ? '\n\nA continuación se pedirán los datos de envío (guía MRW, etc.).'
      : '';
  return window.confirm(
    `¿Cambiar el estado del pedido a «${status}»?${envíoHint}`
  );
}

/**
 * Botones para pasar el pedido (o un lote) a otro estado. Siempre pide confirmación antes de llamar a `onUpdate`.
 */
export const StatusUpdateMenu = ({
  onUpdate,
  isBulk = false,
  currentStatus,
  bulkCount = 0,
  allowedOnly,
  disabledStatuses,
}: {
  onUpdate: (status: OrderStatus) => void;
  isBulk?: boolean;
  currentStatus?: OrderStatus;
  bulkCount?: number;
  allowedOnly?: OrderStatus[];
  /** Botones deshabilitados con el motivo accesible (title/aria-label) a mostrar. */
  disabledStatuses?: Partial<Record<OrderStatus, string>>;
}) => {
  // PRD-200 UI: en operación masiva no se permite 'Enviado' ni 'Entregado'
  // (requieren acción individual con tracking/email por pedido).
  const BULK_EXCLUDED: readonly OrderStatus[] = ['Enviado', 'Entregado'];

  const options: ButtonStatus[] = allowedOnly?.length
    ? validStatuses.filter((s): s is ButtonStatus => (allowedOnly as readonly string[]).includes(s))
    : isBulk
      ? validStatuses.filter((s): s is ButtonStatus => !BULK_EXCLUDED.includes(s))
      : [...validStatuses];

  const handleClick = (status: OrderStatus) => {
    if (!isBulk && currentStatus === status) return;
    if (!confirmStatusChange(status, { isBulk, bulkCount })) return;
    onUpdate(status);
  };

  return (
    <div
      className={`flex flex-wrap gap-2 sm:gap-2.5 ${isBulk ? '' : 'justify-start'}`}
      role="group"
      aria-label={isBulk ? 'Cambiar estado de los pedidos seleccionados' : 'Cambiar estado del pedido'}
    >
      {options.map(status => {
        const isCurrent = !isBulk && currentStatus === status;
        const disabledReason = disabledStatuses?.[status];
        const isDisabled = isCurrent || Boolean(disabledReason);
        const title = isCurrent
          ? 'Ya está en este estado'
          : disabledReason ?? `Marcar como ${status}`;
        return (
          <button
            key={status}
            type="button"
            disabled={isDisabled}
            onClick={() => handleClick(status)}
            title={title}
            aria-label={disabledReason ? `${status}: ${disabledReason}` : undefined}
            aria-disabled={isDisabled}
            className={`touch-manipulation select-none min-h-[44px] min-w-[44px] px-3 sm:px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-colors disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed ${buttonTone[status]}`}
          >
            {status}
          </button>
        );
      })}
    </div>
  );
};
