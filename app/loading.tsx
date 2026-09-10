/**
 * loading.tsx — Boundary de carga global (Next.js App Router)
 * Cubre rutas que no tienen su propio loading.tsx.
 * Skeleton visual coherente con la identidad MundoTech.
 */

export default function GlobalLoading() {
  return (
    <div className="min-h-[60vh] w-full max-w-[1400px] mx-auto px-4 py-10 animate-fade-up">
      {/* Hero skeleton */}
      <div className="skeleton rounded-2xl h-64 sm:h-80 w-full mb-10" />

      {/* Shelf header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="skeleton h-6 w-32 rounded-full" />
        <div className="skeleton h-4 w-48 rounded-full" />
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-12">
        {Array.from({ length: 10 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>

      {/* Second shelf header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="skeleton h-6 w-40 rounded-full" />
        <div className="skeleton h-4 w-36 rounded-full" />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="skeleton aspect-[4/5] sm:aspect-square w-full" />
      <div className="px-2 pt-1.5 pb-2 sm:p-3 space-y-2">
        <div className="skeleton h-3 w-3/4 rounded-full" />
        <div className="skeleton h-3 w-1/2 rounded-full" />
        <div className="skeleton h-5 w-2/3 rounded-full mt-2" />
        <div className="skeleton h-8 sm:h-10 w-full rounded-full mt-1" />
      </div>
    </div>
  );
}
