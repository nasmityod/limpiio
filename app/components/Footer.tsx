import Link from 'next/link';
import { Phone, MapPin, Mail, Clock } from 'lucide-react';
import type { SiteShellData } from '@/lib/site-shell-cache';
import { whatsappHref } from '@/lib/mundotech-social';
import { resolveFooterPhoneLinks } from '@/lib/footer-phones';
import Logo from '@/components/Logo';

/** Glyph de Instagram (lucide 1.x no exporta iconos de marca). */
const InstagramGlyph = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

/**
 * Footer de la tienda. Todos los datos se reciben vía props desde layout.tsx
 * — nunca consulta Prisma directamente. SESIÓN 15.
 *
 * Los métodos de pago listados son exactamente los que acepta el checkout
 * (unión web + WhatsApp), sin datos privados.
 */
export default function Footer({ shellData }: { shellData: SiteShellData }) {
  const { settings, siteContent: content, categoryPaths, openingHours, paymentMethodLabels } =
    shellData;

  const waHref = whatsappHref(
    content.whatsapp.phone || settings.phone,
    'Hola MundoTech, los contacto desde la página web.',
  );

  const phoneLinks = resolveFooterPhoneLinks(settings.phone, settings.phone2);
  const paymentLabels = Array.from(
    new Set(paymentMethodLabels.map((n) => n.trim()).filter(Boolean)),
  );

  return (
    <footer className="relative bg-black text-white mt-12 border-t-2 border-brand-yellow/60 overflow-hidden" data-logo-surface="dark">
      <div className="absolute inset-0 circuit-bg opacity-30 pointer-events-none" aria-hidden />
      <div className="absolute inset-0 dot-pattern pointer-events-none" aria-hidden />
      <div className="relative max-w-[1400px] mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">

          {/* Marca + datos verificables */}
          <div className="md:col-span-5">
            <Logo variant="dark" size="lg" href="/" />
            <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.24em] text-brand-yellow">
              Conectados Contigo
            </p>
            {settings.tagline && (
              <p className="text-on-dark text-sm leading-relaxed mt-3 max-w-sm">
                {settings.tagline.replace(/^Conectados Contigo\s*[—–-]\s*/i, '').trim()}
              </p>
            )}

            <div className="mt-5 space-y-2.5">
              {settings.address && (
                <div className="flex items-start gap-2 text-[13px] text-on-dark">
                  <MapPin size={13} className="text-brand-yellow flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{settings.address}</span>
                </div>
              )}
              {openingHours.length > 0 && (
                <div className="flex items-start gap-2 text-[13px] text-on-dark">
                  <Clock size={13} className="text-brand-yellow flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {openingHours.map((h) => `${h.day}: ${h.hours}`).join(' · ')}
                  </span>
                </div>
              )}
              {phoneLinks.map((phone) => (
                <a
                  key={phone.href + phone.display}
                  href={phone.href}
                  className="flex items-center gap-2 text-[13px] text-on-dark hover:text-brand-yellow transition-colors"
                >
                  <Phone size={13} className="text-brand-yellow flex-shrink-0" aria-hidden="true" />
                  {phone.display}
                </a>
              ))}
              <a
                href={`mailto:${settings.email}`}
                className="flex items-center gap-2 text-[13px] text-on-dark hover:text-brand-yellow transition-colors"
              >
                <Mail size={13} className="text-brand-yellow flex-shrink-0" aria-hidden="true" />
                {settings.email}
              </a>
            </div>

            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-4 text-[13px] font-semibold text-[#7bedaa] transition-colors hover:bg-[#25D366]/20"
            >
              <svg viewBox="0 0 32 32" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path d="M16.04 4C9.5 4 4.2 9.3 4.2 15.83c0 2.08.55 4.12 1.6 5.92L4 28l6.42-1.68a11.8 11.8 0 0 0 5.62 1.43h.01c6.53 0 11.84-5.3 11.84-11.84C27.89 9.3 22.57 4 16.04 4Zm5.4 14.37c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.3-.77.96-.94 1.15-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47a8.9 8.9 0 0 1-1.65-2.04c-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.66-1.6-.9-2.18-.24-.58-.49-.5-.66-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.87 1.21 3.06c.15.2 2.09 3.2 5.07 4.48.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.24-.7.24-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
              </svg>
              Escríbenos por WhatsApp
            </a>
          </div>

          {/* Links de tienda */}
          <div className="md:col-span-2">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-300 mb-4">Tienda</h3>
            <ul className="space-y-2">
              <li><Link href="/"                        className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Inicio</Link></li>
              <li><Link href="/productos"                className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Catálogo</Link></li>
              <li><Link href="/nosotros"                 className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Quiénes somos</Link></li>
              <li><Link href="/tienda-barquisimeto"      className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Nuestra tienda</Link></li>
              <li><Link href={categoryPaths.accesoriosPath} className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Accesorios</Link></li>
            </ul>
          </div>

          {/* Ayuda */}
          <div className="md:col-span-2">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-300 mb-4">Ayuda</h3>
            <ul className="space-y-2">
              <li><Link href="/account/orders"   className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Mis pedidos</Link></li>
              <li><Link href="/pedido"           className="text-sm text-on-dark hover:text-brand-yellow transition-colors">¿Dónde está mi pedido?</Link></li>
              <li><Link href="/devoluciones"     className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Devoluciones y garantía</Link></li>
              <li><Link href="/shipping-policy"  className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Envíos</Link></li>
              <li><Link href="/privacy-policy"   className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Privacidad</Link></li>
              <li><Link href="/terms-of-service" className="text-sm text-on-dark hover:text-brand-yellow transition-colors">Términos</Link></li>
            </ul>
          </div>

          {/* Redes + pagos */}
          <div className="md:col-span-3">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-300 mb-4">Síguenos</h3>
            <div className="flex gap-3 mb-6">
              {settings.instagram ? (
                <a
                  href={settings.instagram}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram de MundoTech"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-white/5 px-4 text-[13px] font-semibold text-gray-300 hover:bg-brand-yellow hover:text-navy transition-all"
                >
                  <InstagramGlyph size={15} />
                  @Mundotech39
                </a>
              ) : null}
            </div>

            {paymentLabels.length > 0 ? (
              <>
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-300 mb-3">Así nos pagas</h3>
                <div className="flex flex-wrap gap-2">
                  {paymentLabels.map((m) => (
                    <span key={m} className="bg-white/5 border border-white/10 text-[11px] font-semibold px-2.5 py-1 rounded-md text-gray-300">
                      {m}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
            <p className="mt-3 text-[11.5px] leading-relaxed text-on-dark">
              Precios en dólares y bolívares, a la tasa del día. El total en Bs se
              calcula al momento de pagar.
            </p>
          </div>
        </div>

        <div className="border-t border-white/5 mt-8 pt-6 text-on-dark-muted text-[12px]">
          <p>&copy; {new Date().getFullYear()} {settings.storeName}{settings.address ? ` · ${settings.address}` : ''}</p>
        </div>
      </div>
    </footer>
  );
}
