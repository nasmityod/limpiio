'use client';

import { useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { UserPlus, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { registerFromOrderAction } from '@/app/actions/authActions';

/**
 * FASE 4.1 (MEJORA 1.2): "Crea tu cuenta en 1 clic" tras la compra invitada.
 * Consume el token guest (?token=) como bearer; el cliente solo define contraseña.
 */
export default function GuestAccountCard({ guestToken }: { guestToken: string }) {
  const { status } = useSession();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated' && !done) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await registerFromOrderAction(guestToken, password);
      if (!result.success || !result.email) {
        setError(result.message);
        return;
      }
      setDone(true);
      const login = await signIn('credentials', {
        email: result.email,
        password,
        redirect: false,
      });
      if (login?.ok) router.refresh();
    } catch {
      setError('No pudimos crear la cuenta. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <div className="mx-auto w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center mb-2">
          <Check size={20} strokeWidth={3} />
        </div>
        <p className="text-sm font-bold text-emerald-800">¡Cuenta creada!</p>
        <p className="text-[13px] text-emerald-700 mt-1">
          Este pedido (y cualquier compra anterior con tu correo) ya está en tu cuenta.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border-2 border-brand-yellowDk/50 bg-brand-yellowSft/60 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy text-brand-yellow">
          <UserPlus size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy">Crea tu cuenta en 1 clic</p>
          <p className="text-[12.5px] text-slate-600 mt-0.5 leading-snug">
            Guardamos tus datos de esta compra. Solo elige una contraseña y podrás
            seguir tus pedidos y comprar más rápido la próxima vez.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña (mínimo 8 caracteres)"
            autoComplete="new-password"
            aria-label="Contraseña para tu nueva cuenta"
            className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 pr-12 text-base sm:text-sm text-navy placeholder:text-slate-400 focus:outline-none focus:border-navy/40 focus:shadow-ring-navy"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-navy"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-brand-yellowDk bg-brand-yellow px-5 text-sm font-black text-navy hover:bg-[#FFE03A] active:scale-[0.98] disabled:opacity-60 transition-all"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          Crear mi cuenta
        </button>
      </form>
      {error && <p className="mt-2 text-[12.5px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
