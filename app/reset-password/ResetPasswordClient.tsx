'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ArrowLeft,
} from 'lucide-react';

import AuthSplitLayout from '@/components/auth/AuthSplitLayout';
import { resetPassword, verifyPasswordResetToken } from '@/app/actions/authActions';
import { cn } from '@/lib/utils';

/**
 * PRD-172 / PRD-224: extrae el token SOLO en el cliente.
 * Preferencia: fragmento `#token=...` (no llega al servidor). Compatibilidad
 * transitoria: `?token=` de correos enviados antes del cambio (15 min de vida).
 */
function readTokenFromLocation(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.replace(/^#/, '');
  const fromHash = new URLSearchParams(hash).get('token');
  if (fromHash?.trim()) return fromHash.trim();
  const fromQuery = new URLSearchParams(window.location.search).get('token');
  return fromQuery?.trim() ?? '';
}

export default function ResetPasswordClient() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [token, setToken] = useState('');
  const [linkState, setLinkState] = useState<'checking' | 'valid' | 'invalid'>('checking');

  useEffect(() => {
    const t = readTokenFromLocation();
    if (!t) {
      setLinkState('invalid');
      return;
    }
    setToken(t);
    let cancelled = false;
    // Validación vía Server Action (viaja en el body del POST, no en la URL).
    verifyPasswordResetToken(t)
      .then((ok) => {
        if (!cancelled) setLinkState(ok ? 'valid' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setLinkState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const invalidLink = linkState === 'invalid';

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErr(null);
    setSubmitErr(null);
    const fd = new FormData(e.currentTarget);
    const p1 = String(fd.get('password') ?? '');
    const p2 = String(fd.get('confirmPassword') ?? '');
    if (p1.length < 8) {
      setFieldErr('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (p1 !== p2) {
      setFieldErr('Las contraseñas no coinciden.');
      return;
    }
    startTransition(async () => {
      const res = await resetPassword(token, p1);
      if (res.ok) {
        setDone(true);
        return;
      }
      setSubmitErr(res.message);
    });
  }

  if (done) {
    return (
      <AuthSplitLayout variant="recovery" breadcrumbLast="Contraseña actualizada">
        <div className="text-center py-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-brand-green">
            <CheckCircle2 size={32} strokeWidth={2} aria-hidden />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-navy">Contraseña actualizada</h1>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            Ya puedes iniciar sesión con tu nueva contraseña.
          </p>
          <Link
            href="/login"
            className={cn(
              'mt-8 inline-flex h-11 items-center justify-center rounded-xl px-8 font-semibold tracking-tight',
              'bg-[#0B1220] text-white shadow-soft hover:bg-[#111826] hover:shadow-card transition-colors',
            )}
          >
            Iniciar sesión
          </Link>
        </div>
      </AuthSplitLayout>
    );
  }

  if (linkState === 'checking') {
    return (
      <AuthSplitLayout variant="recovery" breadcrumbLast="Verificando enlace">
        <div className="flex items-center gap-3 py-10 justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="text-sm font-medium">Verificando el enlace…</span>
        </div>
      </AuthSplitLayout>
    );
  }

  if (invalidLink) {
    return (
      <AuthSplitLayout variant="recovery" breadcrumbLast="Enlace inválido">
        <div>
          <div
            role="alert"
            className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" aria-hidden />
            <div>
              <p className="font-semibold text-navy">No pudimos validar este enlace</p>
              <p className="mt-2 text-rose-800/90 leading-relaxed">
                El enlace puede haber caducado o ya fue utilizado. Solicita uno nuevo desde la página de
                acceso.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/forgot-password"
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-yellow px-4 font-semibold text-navy hover:bg-[#FFE03A] transition-colors"
                >
                  Solicitar nuevo enlace
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 px-4 font-semibold text-navy hover:bg-slate-50 transition-colors"
                >
                  Ir al login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout variant="recovery" breadcrumbLast="Nueva contraseña">
      <div>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-slate-500 hover:text-navy transition-colors mb-4"
        >
          <ArrowLeft size={14} aria-hidden /> Volver al inicio de sesión
        </Link>

        <header className="mb-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy text-brand-yellow shadow-soft">
              <Lock size={20} strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-navy">
                Nueva contraseña
              </h1>
              <p className="mt-1 text-sm text-slate-600 leading-snug">
                Elige una contraseña segura. Tu sesión anterior seguirá cerrada hasta que vuelvas a entrar.
              </p>
            </div>
          </div>
        </header>

        <div className="mb-5 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 text-sm text-navy flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-green mt-0.5" aria-hidden />
          <span>Enlace verificado. Este paso caduca en minutos si no lo completas.</span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium text-navy">
              Nueva contraseña
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock size={17} aria-hidden />
              </span>
              <input
                id="reset-password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={pending}
                placeholder="Mínimo 8 caracteres"
                className={cn(
                  'w-full min-h-[44px] rounded-2xl border border-slate-200 bg-slate-100/70 pl-11 pr-12 text-base text-navy placeholder:text-slate-400 outline-none transition-colors duration-200 focus:bg-white focus:ring-2 focus:ring-navy/40 disabled:opacity-55',
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-navy min-h-[44px] min-w-[44px] flex items-center justify-center"
                onClick={() => setShowPwd((v) => !v)}
                aria-label="Mostrar u ocultar contraseña"
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="reset-password-2" className="mb-1.5 block text-sm font-medium text-navy">
              Confirmar contraseña
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock size={17} aria-hidden />
              </span>
              <input
                id="reset-password-2"
                name="confirmPassword"
                type={showPwd2 ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={pending}
                placeholder="Repite la contraseña"
                className={cn(
                  'w-full min-h-[44px] rounded-2xl border border-slate-200 bg-slate-100/70 pl-11 pr-12 text-base text-navy placeholder:text-slate-400 outline-none transition-colors duration-200 focus:bg-white focus:ring-2 focus:ring-navy/40 disabled:opacity-55',
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-navy min-h-[44px] min-w-[44px] flex items-center justify-center"
                onClick={() => setShowPwd2((v) => !v)}
                aria-label="Mostrar u ocultar confirmación"
              >
                {showPwd2 ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {(fieldErr || submitErr) && (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>{fieldErr ?? submitErr}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className={cn(
              'flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold tracking-tight shadow-soft transition-all',
              'bg-[#FFD700] text-[#0B1220] hover:bg-[#FFE03A] hover:shadow-card disabled:opacity-55 disabled:pointer-events-none',
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              'Guardar contraseña'
            )}
          </button>
        </form>
      </div>
    </AuthSplitLayout>
  );
}
