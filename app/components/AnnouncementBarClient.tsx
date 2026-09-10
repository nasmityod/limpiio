'use client';

import { useLayoutEffect, useState } from 'react';
import { X } from 'lucide-react';

const COOKIE_KEY = 'mt_announcement_dismissed';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 año

function readDismissedTextKey(textKey: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${COOKIE_KEY.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')}=([^;]*)`),
    );
    if (!match?.[1]) return false;
    return decodeURIComponent(match[1]) === textKey;
  } catch {
    return false;
  }
}

/**
 * Wrapper cliente del AnnouncementBar. El contenido real (texto/enlace) llega
 * como `children` desde el Server Component padre, por lo que ya está en el
 * HTML inicial (visible para Googlebot).
 *
 * Dismiss: cookie HTTP leída en cliente (useLayoutEffect) para no usar
 * cookies() en el layout raíz — requisito para ISR del home.
 *
 * Trade-off: usuarios que ya cerraron el aviso pueden ver un frame breve
 * antes de ocultarse; el contenido indexable del home no se ve afectado.
 */
export default function AnnouncementBarClient({
  children,
  textKey,
  bgColor,
  textColor,
}: {
  children: React.ReactNode;
  textKey: string;
  bgColor: string;
  textColor: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  useLayoutEffect(() => {
    if (readDismissedTextKey(textKey)) {
      setDismissed(true);
    }
  }, [textKey]);

  const dismiss = () => {
    try {
      document.cookie = `${COOKIE_KEY}=${encodeURIComponent(textKey)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    } catch {
      // no-op si cookies están bloqueadas
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div
      className="relative w-full text-center text-[13px] sm:text-sm font-semibold px-10 py-2"
      style={{ backgroundColor: bgColor, color: textColor }}
      role="region"
      aria-label="Anuncio"
    >
      {children}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar anuncio"
        className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full hover:bg-black/10 active:bg-black/20"
        style={{ color: textColor }}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
