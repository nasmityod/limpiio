'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Star, Loader2, CheckCircle2, ShieldCheck, MessageSquarePlus, X, Pencil, Trash2, Camera, ChevronRight, ChevronDown } from 'lucide-react';
import { Stars } from '@/components/reviews/Stars';
import type { Review, ReviewSummary } from '@/lib/definitions';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface Props {
  productId: string;
  productName: string;
  initialSummary: ReviewSummary;
  initialReviews: Review[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
}

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-orange-100 text-orange-700',
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function ProductReviews({ productId, productName, initialSummary, initialReviews }: Props) {
  const { data: session, status } = useSession();
  const [summary, setSummary] = useState<ReviewSummary>(initialSummary);
  const [reviews, setReviews] = useState<Review[]>(initialReviews);

  const [showForm, setShowForm] = useState(false);
  /** PRD-162: id de la reseña propia en edición (null = creando una nueva). */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const MAX_PHOTOS = 4;
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [filterStar, setFilterStar] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'highest' | 'lowest'>('recent');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const isAuthed = status === 'authenticated' && !!session?.user;
  const sessionUserId = session?.user?.id ?? null;

  const refresh = async () => {
    try {
      const res = await fetch(`/api/products/${productId}/reviews`);
      if (res.ok) {
        const data = (await res.json()) as { summary: ReviewSummary; reviews: Review[] };
        setSummary(data.summary);
        setReviews(data.reviews);
      }
    } catch (err) {
      console.error('[ProductReviews] Error al refrescar reseñas:', err);
    }
  };

  // Reconciliar con el API (no-store) al cargar: garantiza que las reseñas
  // recién aprobadas por el admin se vean al instante, sin esperar al ISR.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // FASE 4.5: deep-link desde el email de solicitud de reseña —
  // /product/[slug]?review=1 abre el formulario y hace scroll a la sección.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('review') !== '1') return;
      setShowForm(true);
      const t = setTimeout(() => {
        document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 250);
      return () => clearTimeout(t);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!lightboxSrc) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxSrc(null); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [lightboxSrc]);

  const onPickPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingPhoto(true);
    setError(null);
    try {
      for (const file of toUpload) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/reviews/upload-photo', { method: 'POST', body: fd });
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !data.url) { setError(data.error ?? 'No se pudo subir la foto.'); continue; }
        setPhotos((prev) => (prev.length < MAX_PHOTOS ? [...prev, data.url!] : prev));
      }
    } finally {
      setUploadingPhoto(false);
    }
  };
  const removePhoto = (url: string) => setPhotos((prev) => prev.filter((p) => p !== url));

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setRating(0); setTitle(''); setComment('');
    setPhotos([]);
  };

  const startEdit = (r: Review) => {
    setDoneMsg(null);
    setError(null);
    setEditingId(r.id);
    setRating(r.rating);
    setTitle(r.title ?? '');
    setComment(r.comment);
    setPhotos(r.photos ?? []);
    setShowForm(true);
  };

  const submit = async () => {
    setError(null);
    if (rating < 1) { setError('Selecciona una valoración (1 a 5 estrellas).'); return; }
    if (comment.trim().length < 5) { setError('Escribe un comentario (mínimo 5 caracteres).'); return; }

    setSubmitting(true);
    try {
      // PRD-162: misma forma para crear (POST) o editar la reseña propia (PATCH).
      const res = await fetch(
        editingId ? `/api/reviews/${editingId}` : `/api/products/${productId}/reviews`,
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, title: title.trim() || null, comment: comment.trim(), photos }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string; moderated?: boolean };
      if (!res.ok) {
        setError(data.error ?? 'No se pudo enviar la reseña.');
        return;
      }
      setDoneMsg(data.message ?? '¡Gracias por tu reseña!');
      resetForm();
      await refresh();
    } catch {
      setError('Hubo un problema. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  /** PRD-162: el autor elimina su propia reseña. */
  const deleteOwn = async (reviewId: string) => {
    if (!window.confirm('¿Eliminar tu reseña? Esta acción no se puede deshacer.')) return;
    setDeletingId(reviewId);
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'No se pudo eliminar la reseña.');
        return;
      }
      setDoneMsg('Tu reseña fue eliminada.');
      if (editingId === reviewId) resetForm();
      await refresh();
    } catch {
      setError('Hubo un problema al eliminar. Intenta de nuevo.');
    } finally {
      setDeletingId(null);
    }
  };

  const total = summary.count;
  const filteredReviews = filterStar ? reviews.filter((r) => r.rating === filterStar) : reviews;
  const sortedReviews = useMemo(() => {
    const arr = [...filteredReviews];
    const byDateDesc = (a: typeof arr[number], b: typeof arr[number]) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    arr.sort((a, b) => {
      if (sortBy === 'highest') return b.rating - a.rating || byDateDesc(a, b);
      if (sortBy === 'lowest') return a.rating - b.rating || byDateDesc(a, b);
      return byDateDesc(a, b); // recent
    });
    return arr;
  }, [filteredReviews, sortBy]);
  const maxBar = Math.max(1, ...summary.breakdown);
  // Con pocas reseñas la gráfica 5★→1★ se ve vacía; mostrarla solo a partir de 4.
  const SHOW_BREAKDOWN_MIN = 4;
  const showBreakdown = total >= SHOW_BREAKDOWN_MIN;

  return (
    <section id="reviews" className="mt-12 sm:mt-16 scroll-mt-24">
      {/* Encabezado */}
      <div className="flex items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="text-[1.4rem] sm:text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">
            Opiniones de clientes
          </h2>
          <p className="text-sm text-slate-500 mt-1">Experiencias reales de quienes ya compraron</p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setDoneMsg(null); setEditingId(null); setShowForm(true); }}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-navy text-white text-sm font-semibold px-4 sm:px-5 py-2.5 hover:bg-navy-700 active:scale-[0.98] transition-all"
          >
            <MessageSquarePlus size={16} /> Escribir reseña
          </button>
        )}
      </div>

      {doneMsg && (
        <div className="mb-6 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm px-4 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {doneMsg}
        </div>
      )}

      {/* Panel resumen */}
      {total > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 sm:p-8 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
            <div className="flex flex-col items-center sm:items-start shrink-0">
              <div className="flex items-end gap-1.5">
                <span className="text-5xl font-black text-navy leading-none nums tabular-nums">{summary.average.toFixed(1)}</span>
                <span className="text-lg font-medium text-slate-400 pb-1">/ 5</span>
              </div>
              <div className="mt-2.5"><Stars rating={summary.average} size={18} /></div>
              <p className="mt-1.5 text-xs text-slate-500">{total} {total === 1 ? 'reseña' : 'reseñas'}</p>
            </div>
            {showBreakdown && (
              <div className="flex-1 w-full space-y-2 sm:border-l sm:border-slate-200 sm:pl-10">
                {[5, 4, 3, 2, 1].map((star) => {
                  const n = summary.breakdown[star - 1];
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFilterStar(filterStar === star ? null : star)}
                      disabled={n === 0}
                      className="w-full flex items-center gap-2.5 group disabled:cursor-default"
                    >
                      <span className="w-4 text-xs font-medium text-slate-600 tabular-nums shrink-0">{star}</span>
                      <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />
                      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-400 group-hover:bg-amber-500 transition-colors"
                          style={{ width: `${(n / maxBar) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 text-xs text-slate-500 tabular-nums shrink-0">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 mb-8 text-center">
          <Star size={26} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-navy">Aún no hay reseñas</p>
          <p className="text-xs text-slate-500 mt-0.5">Sé el primero en opinar sobre {productName}</p>
        </div>
      )}

      {/* Filtros */}
      {reviews.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterStar(null)}
              className={`text-xs font-semibold px-3.5 py-2 rounded-full border transition-colors ${
                filterStar === null ? 'bg-navy text-white border-navy' : 'border-slate-200 text-slate-600 hover:border-navy'
              }`}
            >
              Todas ({summary.count})
            </button>
            {[5, 4, 3, 2, 1].map((s) => {
              const n = summary.breakdown[s - 1];
              return (
                <button
                  key={s}
                  type="button"
                  disabled={n === 0}
                  onClick={() => setFilterStar(s)}
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-3.5 py-2 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    filterStar === s ? 'bg-navy text-white border-navy' : 'border-slate-200 text-slate-600 hover:border-navy'
                  }`}
                >
                  {s} <Star size={11} className="fill-current" /> ({n})
                </button>
              );
            })}
          </div>
          <div className="relative shrink-0">
            <label htmlFor="review-sort" className="sr-only">Ordenar reseñas</label>
            <select
              id="review-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'highest' | 'lowest')}
              className="appearance-none rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600 pl-3.5 pr-8 py-2 hover:border-navy focus:border-navy focus:ring-2 focus:ring-navy/10 outline-none cursor-pointer"
            >
              <option value="recent">Más recientes</option>
              <option value="highest">Mejor valoradas</option>
              <option value="lowest">Peor valoradas</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 mb-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-navy">
              {editingId ? `Editar tu reseña de ${productName}` : `Tu reseña de ${productName}`}
            </h3>
            <button type="button" onClick={resetForm} aria-label="Cerrar" className="min-w-[44px] min-h-[44px] -my-3 -mr-3 flex items-center justify-center text-slate-400 hover:text-navy">
              <X size={18} />
            </button>
          </div>
          {!isAuthed ? (
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-5 text-center">
              <p className="text-sm text-slate-600">Inicia sesión para compartir tu opinión sobre este producto.</p>
              <Link href="/login" className="mt-3 inline-flex items-center justify-center rounded-xl bg-navy text-white text-sm font-semibold px-5 py-2.5 hover:bg-navy-700 transition-colors">
                Iniciar sesión
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p id="review-rating-label" className="block text-xs font-semibold text-slate-600 mb-1.5">Tu valoración</p>
                <div role="radiogroup" aria-labelledby="review-rating-label" className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={rating === s}
                      onClick={() => setRating(s)}
                      // Pointer events: el preview también funciona en touch
                      // (onMouseEnter solo aplicaba con mouse real).
                      onPointerEnter={() => setHover(s)}
                      onPointerLeave={() => setHover(0)}
                      onPointerCancel={() => setHover(0)}
                      aria-label={`${s} ${s === 1 ? 'estrella' : 'estrellas'}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
                    >
                      <Star size={30} aria-hidden className={(hover || rating) >= s ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="review-title" className="block text-xs font-semibold text-slate-600 mb-1.5">Título (opcional)</label>
                <input id="review-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
                  placeholder="Resume tu experiencia" enterKeyHint="next" autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base focus:border-navy focus:ring-2 focus:ring-navy/10 outline-none" />
              </div>
              <div>
                <label htmlFor="review-comment" className="block text-xs font-semibold text-slate-600 mb-1.5">Tu comentario</label>
                <textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={4}
                  placeholder="¿Qué te pareció el producto? ¿Lo recomiendas?"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base focus:border-navy focus:ring-2 focus:ring-navy/10 outline-none resize-y" />
              </div>
              <div>
                <p className="block text-xs font-semibold text-slate-600 mb-1.5">Fotos (opcional, máx {MAX_PHOTOS})</p>
                <div className="flex flex-wrap items-center gap-2">
                  {photos.map((src) => (
                    <div key={src} className="relative w-16 h-16">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="Foto de la reseña" loading="lazy" decoding="async" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                      <button type="button" onClick={() => removePhoto(src)} aria-label="Quitar foto"
                        className="absolute -top-1.5 -right-1.5 bg-white border border-slate-200 rounded-full p-0.5 shadow-sm text-slate-500 hover:text-rose-600">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <label className="w-16 h-16 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 cursor-pointer text-slate-400 hover:border-navy hover:text-navy transition">
                      {uploadingPhoto ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                      <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" disabled={uploadingPhoto}
                        onChange={(e) => { void onPickPhotos(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button type="button" onClick={submit} disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy text-white text-sm font-semibold px-6 py-2.5 hover:bg-navy-700 active:scale-[0.98] transition-all disabled:opacity-50">
                {submitting ? <><Loader2 size={15} className="animate-spin" /> Enviando…</> : editingId ? 'Guardar cambios' : 'Publicar reseña'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {reviews.length === 0 ? null : filteredReviews.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">
          No hay reseñas de {filterStar} {filterStar === 1 ? 'estrella' : 'estrellas'}.
        </p>
      ) : (
        <ul className="space-y-4 sm:space-y-5">
          {sortedReviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-3.5">
                <div className={`shrink-0 w-11 h-11 rounded-full font-bold flex items-center justify-center text-sm uppercase ${avatarColor(r.authorName || '?')}`}>
                  {(r.authorName?.trim()?.charAt(0) || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-navy text-sm">{r.authorName}</span>
                      {r.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                          <ShieldCheck size={12} /> Compra verificada
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {sessionUserId && r.userId === sessionUserId && (
                        <span className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => startEdit(r)} aria-label="Editar tu reseña"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-navy px-1.5 py-1 rounded transition-colors">
                            <Pencil size={11} /> Editar
                          </button>
                          <button type="button" onClick={() => deleteOwn(r.id)} disabled={deletingId === r.id} aria-label="Eliminar tu reseña"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 px-1.5 py-1 rounded transition-colors disabled:opacity-50">
                            {deletingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Eliminar
                          </button>
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">{formatDate(r.createdAt)}</span>
                    </div>
                  </div>
                  <div className="mt-1.5"><Stars rating={r.rating} size={14} /></div>
                  {r.title && <p className="mt-2 text-sm font-semibold text-navy">{r.title}</p>}
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed whitespace-pre-line">{r.comment}</p>
                  {r.photos && r.photos.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.photos.map((src) => (
                        <button key={src} type="button" onClick={() => setLightboxSrc(src)} aria-label="Ver foto en grande"
                          className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Foto de ${r.authorName}`} loading="lazy" decoding="async"
                            className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover border border-slate-200 hover:opacity-90 transition cursor-zoom-in" />
                        </button>
                      ))}
                    </div>
                  )}
                  {r.adminReply && (
                    <div className="mt-3 rounded-xl bg-amber-50/60 border border-amber-100 px-3.5 py-2.5">
                      <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <ChevronRight size={12} /> Respuesta de MundoTech
                      </p>
                      <p className="text-sm text-slate-600 mt-0.5">{r.adminReply}</p>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Visor de fotos (lightbox) con focus trap y scroll lock */}
      {lightboxSrc && (
        <ReviewLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </section>
  );
}

/* ── Lightbox para fotos de reseñas con focus trap y scroll lock ── */
function ReviewLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useBodyScrollLock(true);
  useFocusTrap({ containerRef: ref, enabled: true, onClose });

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Foto de la reseña"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
    >
      <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute top-2 right-2 z-[1] min-w-[48px] min-h-[48px] flex items-center justify-center text-white/80 hover:text-white">
        <X size={28} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Foto de la reseña" loading="lazy" decoding="async" className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain" />
    </div>
  );
}
