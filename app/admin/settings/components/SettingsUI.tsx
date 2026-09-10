'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Save, Check } from 'lucide-react';

export function SectionCard({
  title,
  description,
  icon: Icon,
  accent,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ElementType;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden shadow-sm ${
        accent ? 'border-brand-yellow border-2' : 'border-gray-200'
      }`}
    >
      <div
        className={`flex items-start gap-2 px-6 py-4 border-b ${
          accent ? 'bg-brand-yellow/10 border-yellow-200' : 'border-gray-100'
        }`}
      >
        <Icon size={17} className={`mt-0.5 shrink-0 ${accent ? 'text-yellow-700' : 'text-navy'}`} />
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-800">{title}</h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

/** ADM-06: inputs táctiles (min-h 48px) + error inline por campo. */
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  disabled,
  id: idProp,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`w-full px-3 py-2 min-h-[48px] rounded-lg border bg-gray-50 text-base sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus:border-navy disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-200'
        }`}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-600 mt-1 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  error,
  rows = 4,
  id: idProp,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  rows?: number;
  id?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`w-full px-3 py-2 min-h-[96px] rounded-lg border bg-gray-50 text-base sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus:border-navy ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-200'
        }`}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-600 mt-1 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
  help,
  id: idProp,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  help?: string;
  id?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <label htmlFor={id} className="flex items-start gap-2 text-sm text-navy cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 rounded border-slate-300 size-4 shrink-0 focus-visible:ring-2 focus-visible:ring-navy/40"
        />
        <span>
          <span className="font-medium">{label}</span>
          {help && <span className="block text-xs text-slate-500 mt-0.5 font-normal">{help}</span>}
        </span>
      </label>
    </div>
  );
}

export function StatusBadge({
  status,
  label,
}: {
  status: 'ok' | 'warn' | 'neutral' | 'active' | 'inactive';
  label: string;
}) {
  const styles =
    status === 'ok' || status === 'active'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'warn' || status === 'inactive'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${styles}`}
    >
      {label}
    </span>
  );
}

export function HelpCallout({
  children,
  variant = 'info',
}: {
  children: ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'danger';
}) {
  const styles =
    variant === 'success'
      ? 'bg-green-50 text-green-800 border-green-200'
      : variant === 'warning'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : variant === 'danger'
          ? 'bg-red-50 text-red-800 border-red-200'
          : 'bg-slate-50 text-navy border-slate-200';
  return (
    <div className={`rounded-lg border px-4 py-3 text-xs font-medium ${styles}`}>{children}</div>
  );
}

export type SaveBarStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export function StickySaveBar({
  status,
  error,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
  secondaryHighlighted,
  primaryHighlighted,
}: {
  status: SaveBarStatus;
  error?: string | null;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  secondaryHighlighted?: boolean;
  primaryHighlighted?: boolean;
}) {
  const statusText =
    status === 'saving'
      ? 'Guardando…'
      : status === 'saved'
        ? 'Cambios guardados'
        : status === 'dirty' || status === 'error'
          ? 'Tienes cambios sin guardar'
          : 'Sin cambios';

  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-6 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-3 py-3 sm:px-4">
      {error && (
        <p role="alert" className="text-xs text-red-600 font-medium mb-2">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          className={`text-sm font-medium ${
            status === 'saved'
              ? 'text-green-600'
              : status === 'dirty' || status === 'error'
                ? 'text-amber-700'
                : 'text-gray-500'
          }`}
          aria-live="polite"
        >
          {status === 'saved' ? (
            <span className="inline-flex items-center gap-1.5">
              <Check size={15} /> {statusText}
            </span>
          ) : (
            statusText
          )}
        </p>
        <div className="flex flex-wrap gap-2 justify-end">
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              disabled={secondaryDisabled}
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50 ${
                secondaryHighlighted
                  ? 'bg-brand-yellow border border-yellow-400 text-navy'
                  : 'bg-white border border-gray-200 text-navy hover:bg-gray-50'
              }`}
            >
              <Save size={15} />
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onPrimary}
            disabled={primaryDisabled}
            className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50 ${
              status === 'saved'
                ? 'bg-green-500 text-white'
                : primaryHighlighted !== false
                  ? 'bg-navy text-white hover:bg-navy/90'
                  : 'bg-white border border-gray-200 text-navy hover:bg-gray-50'
            }`}
          >
            {status === 'saved' ? <Check size={15} /> : <Save size={15} />}
            {status === 'saving' ? 'Guardando…' : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  badge,
}: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  badge?: ReactNode;
}) {
  const autoId = useId();
  const panelId = `${autoId}-panel`;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        id={`${autoId}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left min-h-[48px] hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-navy">{title}</span>
            {badge}
          </div>
          {summary && !open && (
            <div className="mt-1 text-xs text-slate-500">{summary}</div>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition-transform mt-0.5 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`${autoId}-trigger`}
        hidden={!open}
        className={open ? 'border-t border-gray-100 px-4 py-4 space-y-4' : undefined}
      >
        {open ? children : null}
      </div>
    </div>
  );
}
