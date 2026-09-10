import { emailSiteBaseUrl } from './site';

/**
 * Sube este número cada vez que reemplaces PNG en public/email/social/.
 * Gmail y Cloudflare cachean por URL; sin ?v= distinto siguen mostrando el icono viejo.
 */
export const EMAIL_SOCIAL_ICONS_VERSION = '3';

/** Iconos blancos en public/email/social/ — visibles sobre fondo navy (MT.bandBg). */
export const EMAIL_SOCIAL_LINKS = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/p/Mundo-Tech-100090548322161',
    icon: 'facebook-white.png',
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@mundotech39',
    icon: 'tiktok-white.png',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/mundotech39/',
    icon: 'instagram-white.png',
  },
] as const;

export function emailSocialIconUrl(filename: string): string {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  return `${base}/email/social/${filename}?v=${EMAIL_SOCIAL_ICONS_VERSION}`;
}
