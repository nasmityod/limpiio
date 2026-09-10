/**
 * loading.tsx — Skeleton del flujo de checkout
 * Reemplaza el spinner global con una representación fiel de los 3 pasos.
 */

export default function CheckoutLoading() {
  return (
    <div className="min-h-[70vh] max-w-2xl mx-auto px-4 py-10 animate-fade-up">

      {/* Progress bar de 3 pasos */}
      <div className="flex items-center gap-2 mb-10">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center gap-2 flex-1">
            <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
            {step < 3 && <div className="skeleton h-1 flex-1 rounded-full" />}
          </div>
        ))}
      </div>

      {/* Título de sección */}
      <div className="skeleton h-7 w-52 rounded-full mb-6" />

      {/* Formulario skeleton */}
      <div className="bg-white rounded-2xl shadow-card p-6 space-y-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
        <FieldSkeleton wide />
        <FieldSkeleton />
        <FieldSkeleton wide />
      </div>

      {/* Resumen de orden */}
      <div className="bg-white rounded-2xl shadow-card p-6">
        <div className="skeleton h-5 w-36 rounded-full mb-4" />
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <div className="skeleton w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-3/4 rounded-full" />
              <div className="skeleton h-3 w-1/3 rounded-full" />
            </div>
            <div className="skeleton h-5 w-16 rounded-full" />
          </div>
        ))}
        <div className="border-t border-border mt-4 pt-4 flex justify-between">
          <div className="skeleton h-5 w-24 rounded-full" />
          <div className="skeleton h-5 w-20 rounded-full" />
        </div>
        <div className="skeleton h-12 w-full rounded-xl mt-4" />
      </div>
    </div>
  );
}

function FieldSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="skeleton h-3 w-24 rounded-full" />
      <div className={`skeleton h-11 rounded-xl ${wide ? "w-full" : "w-full"}`} />
    </div>
  );
}
