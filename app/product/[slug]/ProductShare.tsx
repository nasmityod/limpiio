'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Copy, Check } from 'lucide-react';
import { FacebookIcon, InstagramIcon } from '@/components/icons/BrandSocialIcons';
import { toast } from '@/components/ui/use-toast';

interface ProductShareProps {
  name: string;
}

export default function ProductShare({ name }: ProductShareProps) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  const copyLink = useCallback(async (shareUrl: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Copia el enlace manualmente desde la barra de direcciones.',
        variant: 'destructive',
      });
    }
  }, []);

  const openShare = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsApp = () => {
    if (!url) return;
    openShare(`https://wa.me/?text=${encodeURIComponent(`${name} ${url}`)}`);
  };

  const handleFacebook = () => {
    if (!url) return;
    openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
  };

  const handleInstagram = async () => {
    if (!url) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch {
        // usuario canceló o share falló → fallback a copiar
      }
    }
    await copyLink(url);
    toast({
      title: 'Enlace copiado',
      description: 'Pégalo en tu historia o bio de Instagram.',
    });
  };

  const handleCopy = () => {
    if (!url) return;
    void copyLink(url);
  };

  const btnBase =
    'flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-opacity hover:opacity-90 active:scale-95 motion-reduce:active:scale-100';

  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-on-light shrink-0">
        Compartir:
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleWhatsApp}
          disabled={!url}
          className={`${btnBase} bg-[#25D366] text-white disabled:opacity-40`}
          aria-label="Compartir en WhatsApp"
        >
          <MessageCircle size={18} aria-hidden />
        </button>
        <button
          type="button"
          onClick={handleFacebook}
          disabled={!url}
          className={`${btnBase} bg-[#1877F2] text-white disabled:opacity-40`}
          aria-label="Compartir en Facebook"
        >
          <FacebookIcon size={18} />
        </button>
        <button
          type="button"
          onClick={() => void handleInstagram()}
          disabled={!url}
          className={`${btnBase} bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white disabled:opacity-40`}
          aria-label="Compartir en Instagram"
        >
          <InstagramIcon size={18} />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!url}
          className={`${btnBase} border border-border bg-surface-muted text-navy disabled:opacity-40`}
          aria-label={copied ? 'Enlace copiado' : 'Copiar enlace'}
        >
          {copied ? <Check size={18} className="text-brand-green" aria-hidden /> : <Copy size={18} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
