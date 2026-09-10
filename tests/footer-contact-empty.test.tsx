/** @vitest-environment jsdom */
/**
 * PRD-101: con la tienda recién instalada, `DEFAULT_SETTINGS` no trae teléfono
 * ni correo. El pie debe OMITIR esas líneas, no renderizar la etiqueta o el
 * icono sin dato detrás, ni un enlace `wa.me` sin destino.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Footer from '@/app/components/Footer';
import { DEFAULT_SETTINGS } from '@/lib/data-store';
import { DEFAULT_SEO_LOCAL } from '@/lib/seo-local-schema';
import { DEFAULT_SITE_CONTENT } from '@/lib/site-content-schema';
import { DEFAULT_ANNOUNCEMENT } from '@/lib/announcement';
import type { SiteShellData } from '@/lib/site-shell-cache';

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} />
  ),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

function buildShellData(
  contact: Partial<SiteShellData['settings']>,
  whatsappPhone = '',
): SiteShellData {
  return {
    announcement: DEFAULT_ANNOUNCEMENT,
    settings: {
      storeName: DEFAULT_SETTINGS.storeName,
      tagline: DEFAULT_SETTINGS.tagline,
      phone: DEFAULT_SETTINGS.phone,
      phone2: DEFAULT_SETTINGS.phone2,
      email: DEFAULT_SETTINGS.email,
      address: DEFAULT_SETTINGS.address,
      instagram: DEFAULT_SETTINGS.instagram,
      facebook: DEFAULT_SETTINGS.facebook,
      ...contact,
    },
    seoLocal: DEFAULT_SEO_LOCAL,
    siteContent: {
      ...DEFAULT_SITE_CONTENT,
      whatsapp: { ...DEFAULT_SITE_CONTENT.whatsapp, phone: whatsappPhone },
    },
    categoryPaths: { accesoriosPath: '/productos' },
    openingHours: [],
    paymentMethodLabels: [],
  };
}

function hrefs(): string[] {
  return Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

afterEach(cleanup);

describe('Footer con datos de contacto vacíos', () => {
  it('no renderiza la etiqueta de teléfono ni la de correo', () => {
    render(<Footer shellData={buildShellData({ phone: '', phone2: '', email: '' })} />);

    expect(hrefs().some((h) => h.startsWith('mailto:'))).toBe(false);
    expect(hrefs().some((h) => h.startsWith('tel:'))).toBe(false);
  });

  it('no deja un enlace wa.me sin destino', () => {
    render(<Footer shellData={buildShellData({ phone: '', phone2: '', email: '' })} />);

    expect(hrefs().some((h) => h.includes('wa.me'))).toBe(false);
    expect(screen.queryByText('Escríbenos por WhatsApp')).toBeNull();
  });

  it('los defaults tal cual tampoco pintan contacto', () => {
    // Sin sobreescribir nada: es el estado real de una tienda recién instalada
    // (config/brand.ts sin NEXT_PUBLIC_CONTACT_* en el entorno de test).
    render(<Footer shellData={buildShellData({})} />);

    expect(hrefs().some((h) => h.startsWith('mailto:'))).toBe(false);
    expect(hrefs().some((h) => h.startsWith('tel:'))).toBe(false);
    expect(hrefs().some((h) => h.includes('wa.me'))).toBe(false);
  });

  it('sí los renderiza en cuanto el admin los configura', () => {
    render(
      <Footer
        shellData={buildShellData({
          phone: '0426-1234567',
          email: 'ventas@tienda.test',
        })}
      />,
    );

    expect(hrefs().some((h) => h === 'mailto:ventas@tienda.test')).toBe(true);
    expect(hrefs().some((h) => h.startsWith('tel:'))).toBe(true);
    expect(hrefs().some((h) => h.includes('wa.me/584261234567'))).toBe(true);
    expect(screen.getByText('ventas@tienda.test')).toBeTruthy();
  });
});
