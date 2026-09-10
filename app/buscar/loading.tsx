import ProductCardSkeleton from '@/components/ProductCardSkeleton';

export default function BuscarLoading() {
  return (
    <div className="pb-10 sm:pb-12 w-full max-w-full animate-pulse">
      {/* Header skeleton */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-4 sm:p-6 lg:p-8 mb-5 sm:mb-8">
        <div className="h-3 w-32 bg-slate-100 rounded-full mb-4" />
        <div className="h-7 w-64 bg-slate-200 rounded-xl mb-2" />
        <div className="h-3.5 w-40 bg-slate-100 rounded-full" />
      </div>

      {/* Content skeleton */}
      <div className="flex flex-col lg:flex-row gap-5 sm:gap-6 lg:gap-8">
        {/* Sidebar */}
        <div className="hidden lg:block w-[260px] flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft h-64" />
        </div>
        {/* Grid */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft h-14 mb-5" />
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
