'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

// ─── Shared types ───────────────────────────────────────────────

export interface OfficeOption {
  name: string;
  address?: string;
  city?: string;
  code?: string;
}

interface OfficeSelectProps {
  options: OfficeOption[];
  selectedIndex: number | null;
  onSelect: (index: number, option: OfficeOption) => void;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
  /** Clase adicional para el botón (útil para ancho compacto). */
  buttonClassName?: string;
  /** Render personalizado del texto del botón (sin cambiar el panel). */
  renderButtonLabel?: (option: OfficeOption) => string;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Construye el texto resumen de la opción seleccionada (truncado). */
function summaryLabel(o: OfficeOption): string {
  let s = o.name;
  if (o.city && o.code) {
    s += ` · ${o.city} (cód. ${o.code})`;
  } else if (o.city) {
    s += ` · ${o.city}`;
  } else if (o.code) {
    s += ` (cód. ${o.code})`;
  }
  return s;
}

// ─── Component ──────────────────────────────────────────────────

export default function OfficeSelect({
  options,
  selectedIndex,
  onSelect,
  disabled = false,
  error = false,
  placeholder = 'Selecciona…',
  buttonClassName,
  renderButtonLabel,
}: OfficeSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  const selected = selectedIndex !== null && selectedIndex >= 0 && selectedIndex < options.length
    ? options[selectedIndex]
    : null;

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Sincronizar focusedIdx con la selección al abrir
  useEffect(() => {
    if (open) {
      setFocusedIdx(selectedIndex ?? 0);
    } else {
      setFocusedIdx(null);
    }
  }, [open, selectedIndex]);

  // Scroll al item enfocado con teclado
  useEffect(() => {
    if (!open || focusedIdx === null) return;
    const el = listRef.current?.children[focusedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, focusedIdx]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!open) { setOpen(true); return; }
          setFocusedIdx((prev) => {
            if (prev === null) return 0;
            return Math.min(prev + 1, options.length - 1);
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!open) return;
          setFocusedIdx((prev) => {
            if (prev === null) return options.length - 1;
            return Math.max(prev - 1, 0);
          });
          break;
        case 'Enter':
        case ' ':
          if (!open) { e.preventDefault(); setOpen(true); return; }
          if (focusedIdx !== null && focusedIdx >= 0 && focusedIdx < options.length) {
            e.preventDefault();
            onSelect(focusedIdx, options[focusedIdx]);
            setOpen(false);
          }
          break;
        case 'Escape':
          if (open) { e.preventDefault(); setOpen(false); }
          break;
      }
    },
    [disabled, open, focusedIdx, options, onSelect],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        className={`flex items-center justify-between gap-1 min-h-[48px] px-3.5 text-base rounded-xl border transition-colors text-left
          ${buttonClassName ?? 'w-full'}
          ${disabled
            ? 'opacity-60 cursor-not-allowed bg-slate-50/70 border-slate-200 text-navy'
            : error
              ? 'bg-slate-50/70 border-red-400 text-navy'
              : 'bg-slate-50/70 border-slate-200 text-navy hover:border-slate-300 focus:outline-none focus:bg-white focus:border-navy focus:shadow-ring-navy'
          }`}
      >
        <span className="flex-1 truncate">
          {selected
            ? <span>{renderButtonLabel ? renderButtonLabel(selected) : summaryLabel(selected)}</span>
            : <span className="text-slate-400">{placeholder}</span>}
        </span>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-activedescendant={focusedIdx !== null ? `office-opt-${focusedIdx}` : undefined}
          className="absolute w-full max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-20 divide-y divide-slate-100 mt-1"
        >
          {options.length === 0 ? (
            <li className="px-3 py-4 text-xs text-slate-400 text-center">Sin opciones disponibles</li>
          ) : (
            options.map((opt, idx) => {
              const isSelected = idx === selectedIndex;
              const isFocused = idx === focusedIdx;
              return (
                <li
                  key={idx}
                  id={`office-opt-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`px-3 py-2.5 cursor-pointer transition-colors
                    ${isSelected ? 'bg-amber-50' : ''}
                    ${isFocused && !isSelected ? 'bg-slate-50' : ''}
                    hover:bg-slate-50
                  `}
                  onClick={() => {
                    onSelect(idx, opt);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setFocusedIdx(idx)}
                >
                  {/* Línea 1: nombre + chip código */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-navy text-sm leading-snug">{opt.name}</span>
                    {opt.code ? (
                      <span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0">
                        cód. {opt.code}
                      </span>
                    ) : null}
                  </div>
                  {/* Línea 2: dirección */}
                  {opt.address?.trim() ? (
                    <p className="text-xs text-slate-500 leading-snug mt-0.5">{opt.address}</p>
                  ) : null}
                  {/* Línea 3: ciudad */}
                  {opt.city?.trim() ? (
                    <p className="text-xs text-slate-400 mt-0.5">{opt.city}</p>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
