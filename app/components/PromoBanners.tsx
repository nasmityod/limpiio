import Image from 'next/image';
import PromotionLink from '@/app/components/PromotionLink';

export interface PromoBannerItem {
  id: string;
  imageUrl: string;
  title: string | null;
  link: string | null;
}

interface Props {
  banners: PromoBannerItem[];
}

function PromoBannerCard({
  banner,
  index,
  priority = false,
}: {
  banner: PromoBannerItem;
  index: number;
  priority?: boolean;
}) {
  const href = banner.link || '/productos';
  const alt = banner.title || 'Promoción MundoTech';
  const promotion = {
    promotion_id: `promo-banner-${banner.id}`,
    promotion_name: banner.title?.trim() || 'Promo banner',
    creative_name: banner.imageUrl ? 'promo-banner-image' : undefined,
    creative_slot: `home_promo_banners_${index + 1}`,
  };

  return (
    <PromotionLink
      href={href}
      promotion={promotion}
      className="group relative block overflow-hidden rounded-2xl border border-slate-200 transition-shadow duration-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700]/60 focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      <div className="relative aspect-[12/5] w-full overflow-hidden bg-[#0B1220]">
        <Image
          src={banner.imageUrl}
          alt={alt}
          fill
          priority={priority}
          fetchPriority={priority ? 'high' : undefined}
          sizes="(max-width: 640px) 100vw, 50vw"
          quality={68}
          className="object-contain transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </div>
    </PromotionLink>
  );
}

export default function PromoBanners({ banners }: Props) {
  if (banners.length === 0) return null;
  const singleBanner = banners.length === 1;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {banners.map((banner, index) => (
        <div
          key={banner.id}
          className={singleBanner ? 'sm:col-span-2' : undefined}
        >
          <PromoBannerCard banner={banner} index={index} priority={false} />
        </div>
      ))}
    </div>
  );
}
