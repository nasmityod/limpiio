import { Star } from 'lucide-react';

/**
 * Estrellas de valoración con relleno fraccional (p. ej. 4.3 de 5).
 * Componente puro sin estado: usable en Server y Client Components.
 */
export function Stars({
  rating,
  size = 14,
  className = '',
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span
      className={`relative inline-flex w-fit align-middle ${className}`}
      aria-label={`${rating.toFixed(1)} de 5 estrellas`}
      role="img"
    >
      <span className="flex gap-0.5 text-slate-300">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} className="shrink-0" />
        ))}
      </span>
      <span
        className="absolute left-0 top-0 h-full overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        <span className="flex gap-0.5 text-amber-400">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={size} className="shrink-0 fill-amber-400" />
          ))}
        </span>
      </span>
    </span>
  );
}

export default Stars;
