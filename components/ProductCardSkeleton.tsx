const ProductCardSkeleton = () => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden">
      <div className="aspect-[4/5] sm:aspect-square skeleton" />
      <div className="px-2 pt-1.5 pb-2 sm:p-4 space-y-2">
        <div className="h-2.5 w-1/3 skeleton rounded-full" />
        <div className="h-3.5 w-full skeleton rounded-full" />
        <div className="h-3.5 w-3/4 skeleton rounded-full" />
        <div className="h-3 w-1/4 skeleton rounded-full mt-3" />
        <div className="h-7 w-1/2 skeleton rounded-lg mt-2" />
        <div className="h-10 w-full skeleton rounded-xl mt-3" />
      </div>
    </div>
  );
};

export default ProductCardSkeleton;
