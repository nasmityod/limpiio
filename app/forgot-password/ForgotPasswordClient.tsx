'use client';

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';

import AuthSplitLayout from '@/components/auth/AuthSplitLayout';
import { requestPasswordReset } from '@/app/actions/authActions';
import { cn } from '@/lib/utils';

export default function ForgotPasswordClient() {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'idle' | 'ok' | 'err'; text?: string }>({
    kind: 'idle',
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '');
    setFeedback({ kind: 'idle' });
    startTransition(async () => {
      const res = await requestPasswordReset(email);
      if (res.ok) {
        setFeedback({ kind: 'ok', text: res.message });
      } else {
        setFeedback({ kind: 'err', text: res.message });
      }
    });
  }

  return (
    <AuthSplitLayout variant="recovery" breadcrumbLast="Recuperar contraseña">
      <div>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-slate-500 hover:text-navy transition-colors mb-4"
        >
          <ArrowLeft size={14} aria-hidden /> Volver al inicio de sesión
        </Link>

        <header className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-navy">
            Recuperar contraseña
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-snug">
            Te enviaremos un enlace seguro para elegir una nueva contraseña. El proceso solo toma unos
            segundos.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-navy">
              Correo electrónico
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Mail size={17} aria-hidden />
              </span>
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={pending}
                placeholder="Correo electrónico"
                className={cn(
                  'w-full min-h-[44px] rounded-2xl border border-slate-200 bg-slate-100/70 pl-11 pr-4 text-base text-navy placeholder:text-slate-400 outline-none transition-colors duration-200 focus:bg-white focus:ring-2 focus:ring-navy/40 disabled:opacity-55',
                )}
              />
            </div>
          </div>

          {feedback.kind === 'ok' && feedback.text && (
            <div
              role="status"
              className="rounded-2xl border border-brand-green/30 bg-emerald-50/90 px-4 py-3 text-sm text-navy leading-relaxed"
            >
              {feedback.text}
            </div>
          )}

          {feedback.kind === 'err' && feedback.text && (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {feedback.text}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className={cn(
              'flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold tracking-tight shadow-soft transition-all',
              'bg-[#0B1220] text-white hover:bg-[#111826] hover:shadow-card disabled:opacity-55 disabled:pointer-events-none',
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Enviando…
              </>
            ) : (
              'Enviar enlace'
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-600">
          ¿Recordaste tu contraseña?{' '}
          <Link href="/login" className="font-semibold text-amber-700 hover:text-amber-800">
            Inicia sesión
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
