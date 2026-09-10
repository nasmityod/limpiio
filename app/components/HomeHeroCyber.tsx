'use client';

import Image from 'next/image';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { ArrowRight, Tag, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useReducedMotion } from '@/lib/motion';

/** Fila del modelo Banner (type: 'hero') tal como llega de Prisma. */
export interface HeroBannerRow {
  id:         string;
  imageUrl:   string;
  title:      string | null;
  subtitle:   string | null;
  label:      string | null;
  ctaText:    string | null;
  tagText:    string | null;
  link:       string | null;
  focalPoint: string | null;
}

/** Contenido editable desde /admin/personalizar. */
export interface HeroFallbackContent {
  badge: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  imageUrl: string;
}

export interface BrandStripContent {
  enabled: boolean;
  slogan: string;
  note: string;
}

type Slide = {
  badge: string;
  title: string;
  sub: string;
  cta: string;
  href: string;
  img: string;
  tag: string;
  focal: string;
};

/** Convierte focalPoint del banner a valor CSS object-position. */
function mapFocal(focal: string): string {
  const map: Record<string, string> = {
    center:       'center',
    top:          'top',
    bottom:       'bottom',
    left:         'left',
    right:        'right',
    'top-left':     'left top',
    'top-right':    'right top',
    'bottom-left':  'left bottom',
    'bottom-right': 'right bottom',
  };
  return map[focal] ?? 'center';
}

function toSlide(b: HeroBannerRow): Slide {
  return {
    badge: b.label ?? '',
    title: b.title ?? '',
    sub: b.subtitle ?? '',
    cta: b.ctaText ?? 'Ver catálogo',
    href: b.link ?? '/productos',
    img: b.imageUrl,
    tag: b.tagText ?? '',
    focal: b.focalPoint ?? 'center',
  };
}

function BadgePill({ label }: { label: string }) {
  if (!label.trim()) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E6C200] bg-[#FFD700] px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-[#0B1220] antialiased">
      <Tag size={11} aria-hidden />
      {label}
    </span>
  );
}

/**
 * Resalta la última palabra del título en amarillo de marca
 * ("CONECTADOS CONTIGO" → CONTIGO dorado, como en el letrero físico).
 */
function AccentTitle({ title }: { title: string }) {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return <>{title}</>;
  const last = words.pop();
  return (
    <>
      {words.join(' ')} <span className="text-[#FFD700]">{last}</span>
    </>
  );
}

/**
 * Hero principal. Las slides vienen del admin (/admin/banners); si no hay,
 * usa el contenido de respaldo editable en /admin/personalizar. La franja
 * inferior lleva el slogan real de la tienda y es visible siempre.
 */
export default function HomeHeroCyber({
  slides: dbSlides,
  fallback,
  brandStrip,
  priorityImages = true,
}: {
  slides?: HeroBannerRow[];
  fallback: HeroFallbackContent;
  brandStrip: BrandStripContent;
  priorityImages?: boolean;
}) {
  const fromDatabase = Boolean(dbSlides && dbSlides.length > 0);
  const slides: Slide[] =
    fromDatabase && dbSlides
      ? dbSlides.map(toSlide)
      : [
          {
            badge: fallback.badge,
            title: fallback.title,
            sub: fallback.subtitle,
            cta: fallback.ctaText || 'Explorar todo el catálogo',
            href: fallback.ctaLink || '/productos',
            // Sin foto stock genérica: si el admin no subió imagen, el fondo
            // es el panel de marca (navy + trazas doradas del logo).
            img: fallback.imageUrl.trim(),
            tag: '',
            focal: 'center',
          },
        ];

  const [active, setActive] = useState(0);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (slides.length <= 1) return;
    if (prefersReduced) return;
    const id = setInterval(() => setActive((v) => (v + 1) % slides.length), 6500);
    return () => clearInterval(id);
  }, [slides.length, prefersReduced]);

  const slide = slides[active] ?? slides[0];

  const showCopy =
    Boolean(slide.tag?.trim()) ||
    Boolean(slide.badge?.trim()) ||
    Boolean(slide.sub?.trim()) ||
    Boolean(slide.title?.trim());

  return (
    <section className="relative w-full max-w-full overflow-hidden rounded-none bg-black antialiased shadow-[0_18px_45px_-16px_rgba(0,0,0,0.28)] ring-0 sm:rounded-2xl sm:ring-1 sm:ring-black/10">
      <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] lg:aspect-[24/9] max-h-[480px]">
        {slide.img ? (
          <div className="absolute inset-0">
            {slides.map((s, i) => {
              if (!s.img) return null;
              // PERF-09 (AUDITORIA-2026-07): solo el slide activo y sus vecinos
              // viven en el DOM — antes se montaban hasta 10 <Image fill> en capas.
              const n = slides.length;
              const dist = Math.min(
                Math.abs(i - active),
                n - Math.abs(i - active),
              );
              if (dist > 1) return null;
              const layerAlt =
                s.title.replace(/\n/g, ' ') || s.badge || 'MundoTech — Conectados Contigo';
              const isActive = i === active;
              return (
                <Image
                  key={fromDatabase && dbSlides ? (dbSlides[i]?.id ?? i) : i}
                  src={s.img}
                  alt={layerAlt}
                  fill
                  priority={priorityImages && i === 0}
                  fetchPriority={priorityImages && i === 0 ? 'high' : 'auto'}
                  quality={priorityImages && i === 0 ? 68 : 65}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1400px"
                  className={`absolute inset-0 object-cover transition-opacity duration-700 ease-out motion-reduce:transition-none ${
                    isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                  style={{ objectPosition: mapFocal(s.focal) }}
                  aria-hidden={isActive ? undefined : true}
                />
              );
            })}
          </div>
        ) : (
          /* Panel de marca: el "letrero" de la tienda cuando no hay foto */
          <div className="absolute inset-0" aria-hidden>
            <div className="absolute inset-0 circuit-bg" />
            <div className="absolute -top-24 -right-16 h-[340px] w-[340px] rounded-full bg-[#FFD700]/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[#FFD700]/40 to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6" data-logo-surface="dark">
              <Logo variant="dark" size="lg" href="/" priority />
              <p className="text-[11px] sm:text-[12px] font-black uppercase tracking-[0.22em] text-brand-yellow">
                Conectados Contigo
              </p>
            </div>
          </div>
        )}

        {showCopy && slide.img && (
          <>
            <div
              className="hidden sm:block pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(to_top,rgba(11,18,32,0.90)_0%,rgba(11,18,32,0.58)_30%,rgba(11,18,32,0.18)_58%,rgba(11,18,32,0)_82%)] sm:bg-[linear-gradient(100deg,rgba(11,18,32,0.78)_0%,rgba(11,18,32,0.46)_36%,rgba(11,18,32,0.10)_64%,rgba(11,18,32,0)_86%)]"
              aria-hidden
            />
            <div
              className="hidden sm:block pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(130%_115%_at_50%_0%,transparent_52%,rgba(11,18,32,0.28)_100%)] sm:bg-[radial-gradient(130%_115%_at_50%_0%,transparent_58%,rgba(11,18,32,0.20)_100%)]"
              aria-hidden
            />
          </>
        )}

        {slide.tag?.trim() ? (
          <span className="hidden sm:inline-flex absolute right-3 top-3 sm:right-5 sm:top-5 z-[2] rounded-md border border-[#E6C200] bg-[#FFD700] px-2 py-1 text-[10px] sm:text-[11px] font-bold text-[#0B1220] shadow-lg">
            {slide.tag}
          </span>
        ) : null}

        {/* Móvil: el copy/CTA vive dentro de la imagen del banner (diseño del
            admin), pero el banner no era tocable — link overlay solo <sm. */}
        {slide.img ? (
          <Link
            href={slide.href}
            aria-label={slide.title.trim() || slide.cta || 'Ver oferta'}
            className="sm:hidden absolute inset-0 z-[2]"
          >
            <span className="sr-only">{slide.cta || 'Ver oferta'}</span>
          </Link>
        ) : null}

        {/* Fallback h1 for screen readers when the hero has no visible copy */}
        {!showCopy && (
          <h1 className="sr-only">
            MundoTech: Conectados Contigo · tecnología y variedades en Barquisimeto
          </h1>
        )}

        {showCopy ? (
          <div className="relative z-10 hidden sm:flex h-full w-full items-end sm:items-center px-4 pb-6 pt-3 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            <div
              key={active}
              className="w-full max-w-full sm:max-w-2xl lg:max-w-[min(36rem,52%)] xl:max-w-2xl text-left animate-fade-up motion-reduce:animate-none pb-1 sm:pb-0"
            >
              <BadgePill label={slide.badge} />

              {slide.title.trim() ? (
                <h1 className="mt-2 text-balance text-[1.4rem] xs:text-[1.55rem] sm:text-[1.85rem] md:text-[2rem] lg:text-[2.15rem] xl:text-[2.35rem] font-bold leading-[1.12] tracking-tight text-white whitespace-pre-line drop-shadow-[0_2px_22px_rgba(0,0,0,0.55)]">
                  {fromDatabase ? slide.title : <AccentTitle title={slide.title} />}
                </h1>
              ) : (
                <h1 className="sr-only">
                  MundoTech: Conectados Contigo · tecnología y variedades en Barquisimeto
                </h1>
              )}

              {slide.sub.trim() ? (
                <p className="mt-2 max-w-full sm:max-w-lg text-[13px] sm:text-[15px] font-medium leading-snug text-white/95 drop-shadow-md sm:leading-relaxed line-clamp-3 sm:line-clamp-none">
                  {slide.sub}
                </p>
              ) : null}

              <div className="mt-3 sm:mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
                <Link
                  href={slide.href}
                  className="btn-mundotech-shimmer inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#E6C200] bg-[#FFD700] px-4 sm:px-5 text-[13px] sm:text-sm font-black text-black shadow-lg transition-all duration-300 active:scale-[0.97] hover:bg-[#FFE03A]"
                >
                  {slide.cta} <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
                </Link>
                <Link
                  href="/nosotros"
                  className="hidden xs:inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/35 bg-white/10 px-4 sm:px-5 text-[13px] sm:text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 active:scale-[0.97] hover:border-[#FFD700]/45 hover:bg-white/15"
                >
                  Conoce la tienda
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {slides.length > 1 ? (
          <div className="absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 items-center sm:bottom-1">
            {/* Dot visual pequeño dentro de un hit-area táctil de 44px */}
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir al slide ${i + 1}`}
                aria-current={i === active ? 'true' : undefined}
                onClick={() => setActive(i)}
                className="min-w-[32px] min-h-[44px] flex items-center justify-center"
              >
                <span
                  aria-hidden
                  className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                    i === active ? 'w-6 bg-[#FFD700]' : 'w-1.5 bg-white/45'
                  }`}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Franja de marca: el slogan del letrero físico, visible siempre */}
      {brandStrip.enabled && brandStrip.slogan.trim() ? (
        <div className="relative border-t border-[#FFD700]/25 bg-black">
          <div className="absolute inset-0 circuit-bg opacity-40" aria-hidden />
          <div className="relative flex items-center justify-center gap-2.5 px-4 py-2.5 sm:py-3 text-center">
            <span className="text-[11px] sm:text-[12.5px] font-black uppercase tracking-[0.22em] text-[#FFD700]">
              {brandStrip.slogan}
            </span>
            {brandStrip.note.trim() ? (
              <>
                <span className="hidden sm:inline text-white/25" aria-hidden>·</span>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11.5px] font-medium text-white/65">
                  <MapPin size={11} className="text-[#FFD700]/70" aria-hidden />
                  {brandStrip.note}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
