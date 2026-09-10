'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Settings2, Truck, Star, MessageSquareText } from 'lucide-react';
import { Stars } from '@/components/reviews/Stars';
import type { ProductSpec } from '@/lib/definitions';
import type { ProductFaqItem } from '@/lib/product-faq';
import { isGenericBrand } from '@/lib/utils';

interface Props {
  description: string | null;
  brand?: string | null;
  category: string;
  sku?: string | null;
  isOut: boolean;
  stock: number;
  specs?: ProductSpec[] | null;
  /** PRD-037: resumen real de reseñas — la tab deja de decir "Próximamente". */
  reviewsCount?: number;
  reviewsAverage?: number;
  /** FASE 3 (SEO): FAQ visible en la pestaña Envío (contenido = FAQPage JSON-LD). */
  faq?: ProductFaqItem[];
}

const tabs = [
  { id: 'description', label: 'Descripción',      icon: FileText  },
  { id: 'specs',       label: 'Especificaciones', icon: Settings2 },
  { id: 'reviews',     label: 'Reseñas',          icon: Star      },
  { id: 'shipping',    label: 'Envío',            icon: Truck     },
] as const;

type TabId = (typeof tabs)[number]['id'];

/**
 * PRD-053: la descripción puede traer HTML (imports CSV / pegado desde otra
 * web). En vez de mostrar las etiquetas literalmente, las convertimos a texto
 * plano con saltos de línea — sin `dangerouslySetInnerHTML` (cero riesgo XSS).
 */
function htmlToPlainText(value: string): string {
  if (!/[<>]/.test(value)) return value;
  return value
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function DescriptionPanel({ plainDescription }: { plainDescription: string }) {
  return (
    <>
      <h2 className="text-base font-bold text-navy mb-3">Descripción</h2>
      <p className="text-[15px] text-slate-600 leading-relaxed text-pretty whitespace-pre-line">
        {plainDescription || 'Este producto aún no tiene una descripción detallada. Pronto añadiremos más información.'}
      </p>
    </>
  );
}

function SpecsPanel({
  specs,
  brand,
  category,
  sku,
  isOut,
  stock,
}: {
  specs?: ProductSpec[] | null;
  brand?: string | null;
  category: string;
  sku?: string | null;
  isOut: boolean;
  stock: number;
}) {
  return (
    <>
      <h2 className="text-base font-bold text-navy mb-3">Especificaciones</h2>
      <dl className="divide-y divide-slate-100">
        {specs && specs.length > 0 && specs.map((spec, i) => (
          <div key={i} className="flex justify-between py-3 gap-4">
            <dt className="text-sm text-slate-500 shrink-0">{spec.name}</dt>
            <dd className="text-sm font-semibold text-navy text-right">{spec.value}</dd>
          </div>
        ))}

        {specs && specs.length > 0 && ((!isGenericBrand(brand) && brand) || sku) && (
          <div className="py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-300">
              Información general
            </p>
          </div>
        )}

        {!isGenericBrand(brand) && brand && (
          <div className="flex justify-between py-3">
            <dt className="text-sm text-slate-500">Marca</dt>
            <dd className="text-sm font-semibold text-navy">{brand}</dd>
          </div>
        )}
        <div className="flex justify-between py-3">
          <dt className="text-sm text-slate-500">Categoría</dt>
          <dd className="text-sm font-semibold text-navy capitalize">{category}</dd>
        </div>
        <div className="flex justify-between py-3">
          <dt className="text-sm text-slate-500">Disponibilidad</dt>
          <dd className={`text-sm font-semibold ${isOut ? 'text-rose-600' : 'text-emerald-600'}`}>
            {isOut ? 'Agotado' : `En stock (${stock} unidades)`}
          </dd>
        </div>
        {sku && (
          <div className="flex justify-between py-3">
            <dt className="text-sm text-slate-500">SKU</dt>
            <dd className="text-sm font-mono text-slate-700">{sku}</dd>
          </div>
        )}

        {(!specs || specs.length === 0) && isGenericBrand(brand) && !sku && (
          <div className="py-4 text-center">
            <p className="text-sm text-slate-400">
              Las especificaciones técnicas de este producto aún no están disponibles.
            </p>
          </div>
        )}
      </dl>
    </>
  );
}

function ShippingPanel({ faq }: { faq?: ProductFaqItem[] }) {
  return (
    <>
      <h2 className="text-base font-bold text-navy mb-3">Envío y garantía</h2>
      <div className="space-y-4 text-[15px] text-slate-600 leading-relaxed">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-navy mb-1">Delivery gratis</p>
            <p className="text-[13px] text-slate-500">Centro y Este de Barquisimeto (condiciones aplican).</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-navy mb-1">MRW, Zoom y Tealca</p>
            <p className="text-[13px] text-slate-500">Cobro a destino — pagas el flete al recibir.</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-navy mb-1">Retiro en tienda</p>
            <p className="text-[13px] text-slate-500">Gratis en Carrera 21, Centro Barquisimeto.</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-navy mb-1">Garantía de 7 días</p>
            <p className="text-[13px] text-slate-500">
              En electrónica general (tienda, no fábrica). Sin garantía en electrónica para vehículos
              ni en productos no electrónicos. Requiere factura y caja original.
            </p>
          </div>
        </div>

        {/* FASE 3 (SEO): FAQ real de la operación — mismo contenido que el
            FAQPage JSON-LD emitido por ProductJsonLd. */}
        {faq && faq.length > 0 && (
          <div className="pt-2">
            <h3 className="text-sm font-bold text-navy mb-2">Preguntas frecuentes</h3>
            <div className="space-y-2">
              {faq.map((f) => (
                <details
                  key={f.question}
                  className="group rounded-2xl border border-slate-200 bg-white open:bg-slate-50 transition-colors"
                >
                  <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-navy [&::-webkit-details-marker]:hidden">
                    {f.question}
                    <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-4 pb-4 text-[13.5px] leading-relaxed text-slate-600">{f.answer}</p>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ReviewsPanel({
  reviewsCount,
  reviewsAverage,
  onScrollToReviews,
}: {
  reviewsCount: number;
  reviewsAverage: number;
  onScrollToReviews: () => void;
}) {
  return (
    <>
      <h2 className="text-base font-bold text-navy mb-3">Reseñas</h2>
      <div className="text-center py-6">
        {reviewsCount > 0 ? (
          <>
            <div className="flex items-center justify-center gap-2">
              <Stars rating={reviewsAverage} size={18} />
              <span className="text-lg font-bold text-navy nums">{reviewsAverage.toFixed(1)}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1.5">
              {reviewsCount} {reviewsCount === 1 ? 'opinión de cliente' : 'opiniones de clientes'} sobre este producto.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-navy">Sé el primero en reseñar este producto</p>
            <p className="text-[13px] text-slate-500 mt-1 max-w-md mx-auto">
              Las reseñas ayudan a otros clientes a tomar una mejor decisión.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={onScrollToReviews}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy text-white text-sm font-semibold px-5 py-2.5 hover:bg-navy-700 active:scale-[0.98] transition-all"
        >
          <MessageSquareText size={15} />
          {reviewsCount > 0 ? 'Ver opiniones' : 'Escribir la primera reseña'}
        </button>
      </div>
    </>
  );
}

export default function ProductTabs({
  description,
  brand,
  category,
  sku,
  isOut,
  stock,
  specs,
  reviewsCount = 0,
  reviewsAverage = 0,
  faq,
}: Props) {
  const [active, setActive] = useState<TabId>('description');
  const tabRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  // PRD-054: navegación por teclado del patrón WAI-ARIA Tabs
  // (flechas ←/→, Home/End; activación automática al mover el foco).
  const onKeyDown = (e: React.KeyboardEvent, current: TabId) => {
    const idx = tabs.findIndex((t) => t.id === current);
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const next = tabs[nextIdx].id;
    setActive(next);
    tabRefs.current.get(next)?.focus();
  };

  const plainDescription = description ? htmlToPlainText(description) : '';

  const scrollToReviews = () => {
    document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-soft overflow-hidden">
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Información del producto"
        className="flex items-center gap-1 px-3 sm:px-5 pt-3 border-b border-slate-100 overflow-x-auto scrollbar-hide"
      >
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button type="button"
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => onKeyDown(e, tab.id)}
              className={`relative inline-flex items-center gap-2 px-4 h-12 text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 rounded-t-lg ${
                isActive ? 'text-navy' : 'text-slate-500 hover:text-navy'
              }`}
            >
              <tab.icon size={15} aria-hidden />
              {tab.label}
              {tab.id === 'reviews' && reviewsCount > 0 && (
                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 nums">
                  {reviewsCount}
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute -bottom-px left-3 right-3 h-[3px] bg-navy rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Content — todos los paneles en el DOM; la tab activa solo controla visibilidad */}
      <div className="p-6 sm:p-8 min-h-[180px]">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <section
              key={tab.id}
              role="tabpanel"
              id={`tabpanel-${tab.id}`}
              aria-labelledby={`tab-${tab.id}`}
              hidden={!isActive}
              tabIndex={isActive ? 0 : -1}
              data-active={isActive}
              className="focus:outline-none"
            >
              {tab.id === 'description' && (
                <DescriptionPanel plainDescription={plainDescription} />
              )}
              {tab.id === 'specs' && (
                <SpecsPanel
                  specs={specs}
                  brand={brand}
                  category={category}
                  sku={sku}
                  isOut={isOut}
                  stock={stock}
                />
              )}
              {tab.id === 'shipping' && <ShippingPanel faq={faq} />}
              {tab.id === 'reviews' && (
                <ReviewsPanel
                  reviewsCount={reviewsCount}
                  reviewsAverage={reviewsAverage}
                  onScrollToReviews={scrollToReviews}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
