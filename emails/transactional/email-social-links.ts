import { emailSiteBaseUrl } from './site';
import { BRAND } from '@/config/brand';

/**
 * Sube este número cada vez que reemplaces PNG en public/email/social/.
 * Gmail y Cloudflare cachean por URL; sin ?v= distinto siguen mostrando el icono viejo.
 */
export const EMAIL_SOCIAL_ICONS_VERSION = '3';

type EmailSocialLink = {
  label: string;
  href: string;
  icon: string;
};

/**
 * Iconos blancos en public/email/social/ — visibles sobre fondo navy (MT.bandBg).
 * Las URLs salen de config/brand.ts: las redes sin variable configurada se
 * omiten, en vez de enlazar a los perfiles de otra tienda.
 */
export const EMAIL_SOCIAL_LINKS: EmailSocialLink[] = (
  [
    { label: 'Facebook', href: BRAND.social.facebook, icon: 'facebook-white.png' },
    { label: 'TikTok', href: BRAND.social.tiktok, icon: 'tiktok-white.png' },
    { label: 'Instagram', href: BRAND.social.instagram, icon: 'instagram-white.png' },
  ] satisfies EmailSocialLink[]
).filter((link) => link.href.length > 0);

export function emailSocialIconUrl(filename: string): string {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  return `${base}/email/social/${filename}?v=${EMAIL_SOCIAL_ICONS_VERSION}`;
}
