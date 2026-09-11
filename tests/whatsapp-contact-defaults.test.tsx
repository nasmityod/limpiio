/** @vitest-environment jsdom */
/**
 * Una tienda derivada de esta base no debe arrancar enviando a sus clientes
 * al WhatsApp de otra empresa. Los dos teléfonos que quedaban hardcodeados
 * (`AuthSplitLayout` y el default de `siteContent.whatsapp.phone`) pasan a
 * resolverse desde `NEXT_PUBLIC_WHATSAPP_URL` y desde Admin → Personalizar,
 * y con el valor vacío el enlace desaparece en vez de quedar roto.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));

/** `config/brand.ts` lee el entorno al importarse: cada caso carga módulos frescos. */
async function loadWithWhatsappUrl(url: string | undefined) {
  vi.resetModules();
  if (url === undefined) vi.stubEnv('NEXT_PUBLIC_WHATSAPP_URL', '');
  else vi.stubEnv('NEXT_PUBLIC_WHATSAPP_URL', url);
  const [{ default: AuthSplitLayout }, { brandWhatsappHref }] = await Promise.all([
    import('@/components/auth/AuthSplitLayout'),
    import('@/lib/social-links'),
  ]);
  return { AuthSplitLayout, brandWhatsappHref };
}

function hrefs(): string[] {
  return Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('brandWhatsappHref', () => {
  it('devuelve null sin NEXT_PUBLIC_WHATSAPP_URL', async () => {
    const { brandWhatsappHref } = await loadWithWhatsappUrl(undefined);
    expect(brandWhatsappHref()).toBeNull();
    expect(brandWhatsappHref('Hola')).toBeNull();
  });

  it('construye el enlace con el mensaje precargado cuando la variable existe', async () => {
    const { brandWhatsappHref } = await loadWithWhatsappUrl('https://wa.me/580000000000');
    expect(brandWhatsappHref()).toBe('https://wa.me/580000000000');
    expect(brandWhatsappHref('  Hola tienda  ')).toBe(
      'https://wa.me/580000000000?text=Hola%20tienda',
    );
  });
});

describe('AuthSplitLayout', () => {
  it('sin NEXT_PUBLIC_WHATSAPP_URL no pinta el enlace ni el párrafo de ayuda', async () => {
    const { AuthSplitLayout } = await loadWithWhatsappUrl(undefined);
    render(
      <AuthSplitLayout variant="login" breadcrumbLast="Iniciar sesión">
        <form />
      </AuthSplitLayout>,
    );

    expect(hrefs().some((h) => h.includes('wa.me'))).toBe(false);
    expect(screen.queryByText('Escríbenos por WhatsApp')).toBeNull();
    // Ningún número de teléfono se cuela en el DOM sin configurarlo.
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{7}/);
  });

  it('con la variable configurada enlaza al WhatsApp de la tienda derivada', async () => {
    const { AuthSplitLayout } = await loadWithWhatsappUrl('https://wa.me/580000000000');
    render(
      <AuthSplitLayout variant="register" breadcrumbLast="Crear cuenta">
        <form />
      </AuthSplitLayout>,
    );

    const link = screen.getByText('Escríbenos por WhatsApp');
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/580000000000\?text=/);
    expect(hrefs().some((h) => h.includes('1471338'))).toBe(false);
  });
});

describe('siteContent.whatsapp.phone', () => {
  it('sale vacío por defecto y el esquema lo admite', async () => {
    const { DEFAULT_SITE_CONTENT, siteContentSchema } = await import('@/lib/site-content-schema');

    expect(DEFAULT_SITE_CONTENT.whatsapp.phone).toBe('');
    expect(siteContentSchema.parse(DEFAULT_SITE_CONTENT).whatsapp.phone).toBe('');

    // Un contenido guardado sin el campo también cae al default vacío.
    const parsed = siteContentSchema.parse({
      heroFallback: {},
      brandStrip: {},
      whatsapp: {},
      productTrust: [{ title: 'Garantía' }],
      popup: {},
    });
    expect(parsed.whatsapp.phone).toBe('');
    expect(parsed.whatsapp.enabled).toBe(true);
  });

  it('ningún default del contenido del sitio lleva un teléfono', async () => {
    const { DEFAULT_SITE_CONTENT } = await import('@/lib/site-content-schema');
    expect(JSON.stringify(DEFAULT_SITE_CONTENT)).not.toMatch(/\d{4}-\d{7}|\d{10,}/);
  });

  it('el FAB no se renderiza con el teléfono vacío', async () => {
    vi.doMock('next/navigation', () => ({ usePathname: () => '/' }));
    const { default: WhatsAppFab } = await import('@/app/components/WhatsAppFab');
    const { container } = render(<WhatsAppFab phone="" message="Hola" />);
    expect(container.querySelector('a')).toBeNull();
    vi.doUnmock('next/navigation');
  });
});
