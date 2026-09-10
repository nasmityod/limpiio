import Image from 'next/image';
import PromotionLink from '@/app/components/PromotionLink';

export interface DiscoverBannerItem {
  id: string;
  imageUrl: string;
  title: string | null;
  link: string | null;
}

export default function DiscoverMosaic({
  banners,
}: {
  banners: DiscoverBannerItem[];
}) {
  if (!banners || banners.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-10">
      <h2 className="mb-3 sm:mb-4 text-lg sm:text-2xl font-black text-navy">
        Descubre
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {banners.map((b, index) => {
          const promotion = {
            promotion_id: `discover-${b.id}`,
            promotion_name: b.title?.trim() || 'Descubre',
            creative_name: b.imageUrl ? 'discover-image' : undefined,
            creative_slot: `home_discover_${index + 1}`,
          };
          return (
            <PromotionLink
              key={b.id}
              href={b.link || '/productos'}
              promotion={promotion}
              className="group relative block aspect-[4/3] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <Image
                src={b.imageUrl}
                alt={b.title || 'Descubre'}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                quality={68}
                className="object-cover"
              />
            </PromotionLink>
          );
        })}
      </div>
    </section>
  );
}
