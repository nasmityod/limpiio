/**
 * loading.tsx — Skeleton de la página de detalle de producto
 * Espeja el layout real: galería izquierda + detalles derecha.
 */

export default function ProductLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 animate-fade-up">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <div className="skeleton h-4 w-16 rounded-full" />
        <div className="skeleton h-4 w-4 rounded-full" />
        <div className="skeleton h-4 w-24 rounded-full" />
        <div className="skeleton h-4 w-4 rounded-full" />
        <div className="skeleton h-4 w-40 rounded-full" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

        {/* Galería */}
        <div className="space-y-3">
          <div className="skeleton aspect-square w-full rounded-2xl" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton aspect-square rounded-xl" />
            ))}
          </div>
        </div>

        {/* Detalles */}
        <div className="space-y-5">
          {/* Badge categoría */}
          <div className="skeleton h-6 w-28 rounded-full" />

          {/* Título */}
          <div className="space-y-2">
            <div className="skeleton h-8 w-full rounded-full" />
            <div className="skeleton h-8 w-3/4 rounded-full" />
          </div>

          {/* Rating */}
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton w-5 h-5 rounded-full" />
            ))}
            <div className="skeleton h-4 w-20 rounded-full" />
          </div>

          {/* Precio */}
          <div className="space-y-1.5">
            <div className="skeleton h-9 w-40 rounded-full" />
            <div className="skeleton h-5 w-32 rounded-full" />
          </div>

          {/* Stock badge */}
          <div className="skeleton h-7 w-28 rounded-full" />

          {/* Descripción */}
          <div className="space-y-2">
            <div className="skeleton h-4 w-full rounded-full" />
            <div className="skeleton h-4 w-5/6 rounded-full" />
            <div className="skeleton h-4 w-4/5 rounded-full" />
          </div>

          {/* Botones CTA */}
          <div className="space-y-3 pt-2">
            <div className="skeleton h-14 w-full rounded-xl" />
            <div className="skeleton h-12 w-full rounded-xl" />
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        </div>
      </div>

      {/* Tabs de información */}
      <div className="mt-12">
        <div className="flex gap-4 border-b border-border mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-8 w-28 rounded-t-lg" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="skeleton h-4 w-full rounded-full" />
          <div className="skeleton h-4 w-5/6 rounded-full" />
          <div className="skeleton h-4 w-4/5 rounded-full" />
          <div className="skeleton h-4 w-3/4 rounded-full" />
        </div>
      </div>
    </div>
  );
}
