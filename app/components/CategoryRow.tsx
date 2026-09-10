import Image from 'next/image';
import Link from 'next/link';

export interface CategoryRowItem {
  name: string;
  slug: string;
  imageUrl: string | null;
}

export default function CategoryRow({ categories }: { categories: CategoryRowItem[] }) {
  if (!categories || categories.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-10">
      <h2 className="mb-3 sm:mb-4 text-lg sm:text-2xl font-black text-navy">Categorías</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/categoria/${c.slug}`}
            className="group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
              {c.imageUrl ? (
                <Image
                  src={c.imageUrl}
                  alt={c.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0B1220] to-[#1a2740]">
                  <span className="text-2xl font-black text-[#FFD700]">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="px-3 py-2.5">
              <p className="truncate text-[13px] sm:text-sm font-semibold text-navy">{c.name}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
