'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
} from 'react';
import Link from 'next/link';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/lib/motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  AlertCircle,
  Loader2,
  ShieldCheck,
  MailCheck,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  authLoginSchema,
  authRegisterSchema,
  type AuthLoginValues,
  type AuthRegisterValues,
} from '@/lib/auth-modal-schema';
import { resolvePostLoginRedirect, safeInternalPath } from '@/lib/auth-path';
import { registerUserAction } from '@/app/actions/authActions';
import { toast } from '@/components/ui/use-toast';

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function passwordStrengthLabel(pw: string) {
  if (!pw) return { score: 0, label: '' as const };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const labels = ['Débil', 'Regular', 'Buena', 'Fuerte'] as const;
  return { score, label: labels[Math.max(0, score - 1)] ?? '' };
}

const storeInput =
  'w-full min-h-[44px] rounded-2xl border border-slate-200 bg-slate-100/70 px-4 text-base text-navy placeholder:text-slate-400 outline-none transition-colors duration-200 focus:bg-white focus:ring-2 focus:ring-navy/40 focus:border-slate-200 disabled:cursor-not-allowed disabled:opacity-55';

interface StoreFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  iconPadLeft?: boolean;
  iconPadRight?: boolean;
}

const StoreInput = forwardRef<HTMLInputElement, StoreFieldProps>(
  ({ invalid, iconPadLeft, iconPadRight, className, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        storeInput,
        iconPadLeft && 'pl-11',
        iconPadRight && 'pr-11',
        invalid && 'border-rose-400 focus:ring-rose-400/35 bg-white',
        className,
      )}
      {...props}
    />
  ),
);
StoreInput.displayName = 'StoreInput';

function AuthDividerWithOAuth({
  googleAvailable,
  callbackUrl,
}: {
  googleAvailable: boolean;
  callbackUrl: string;
}) {
  if (!googleAvailable) return null;
  return (
    <div className="relative mt-7 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap px-1">
          o continuar con
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => signIn('google', { callbackUrl: safeInternalPath(callbackUrl) })}
        className={cn(
          'flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-navy',
          'shadow-soft hover:shadow-card hover:border-slate-300 transition-all duration-200',
        )}
      >
        <GoogleMark className="h-5 w-5 shrink-0" />
        Google
      </motion.button>
    </div>
  );
}

interface LoginPanelProps {
  callbackUrl: string;
  /** Opcional: tras registro redirige aquí con ?registered=1&email= */
  defaultEmail?: string;
}

export function AuthLoginForm({ callbackUrl, defaultEmail }: LoginPanelProps) {
  const prefersReduced = useReducedMotion();
  const router = useRouter();
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [shake, setShake] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const form = useForm<AuthLoginValues>({
    resolver: zodResolver(authLoginSchema),
    mode: 'onChange',
    defaultValues: { email: defaultEmail ?? '', password: '' },
  });

  useEffect(() => {
    if (!defaultEmail) return;
    form.reset({ email: defaultEmail, password: '' });
  }, [defaultEmail, form]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (!cancelled) setGoogleAvailable(Boolean(data?.google));
      })
      .catch(() => {
        if (!cancelled) setGoogleAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Solo auto-enfocar con puntero fino (desktop): en móvil levantaba el
    // teclado virtual al instante y tapaba media pantalla.
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById('login-email')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    window.setTimeout(() => setShake(false), 480);
  }, []);

  const finishSuccess = useCallback(async () => {
    toast({
      title: 'Sesión iniciada',
      description: 'Bienvenido de nuevo a MundoTech.',
      variant: 'success',
    });
    router.refresh();
    const session = await getSession();
    const role = session?.user?.role?.toUpperCase?.();
    router.push(resolvePostLoginRedirect(role, callbackUrl));
  }, [callbackUrl, router]);

  const onSubmit: SubmitHandler<AuthLoginValues> = async (data) => {
    try {
      sessionStorage.setItem('mundotech-auth-remember', rememberMe ? '1' : '0');
    } catch {
      /* ignore */
    }
    form.clearErrors('root');
    try {
      const result = await signIn('credentials', {
        redirect: false,
        email: data.email,
        password: data.password,
      });
      if (result?.error) {
        form.setError('root', {
          message: 'Credenciales incorrectas o cuenta inexistente.',
        });
        triggerShake();
        return;
      }
      await finishSuccess();
    } catch {
      form.setError('root', {
        message: 'Demasiados intentos. Espera un minuto e intenta de nuevo.',
      });
      triggerShake();
    }
  };

  const submitting = form.formState.isSubmitting;

  return (
    <div>
      <header className="mb-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy text-brand-yellow shadow-soft">
            <ShieldCheck size={22} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 id="login-heading" className="text-xl sm:text-2xl font-bold tracking-tight text-navy">
              Inicia sesión
            </h1>
            <p className="mt-1 text-sm text-slate-600 leading-snug">
              Tus pedidos, garantías y favoritos, todo en un solo lugar.
            </p>
          </div>
        </div>
      </header>

      <motion.form
        animate={shake ? (prefersReduced ? { opacity: [1, 0.7, 1] } : { x: [0, -6, 6, -4, 4, 0] }) : { x: 0 }}
        transition={{ duration: prefersReduced ? 0.15 : 0.42 }}
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        aria-labelledby="login-heading"
      >
        {form.formState.errors.root && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            {form.formState.errors.root.message}
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-navy">
            Correo electrónico
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Mail size={17} />
            </span>
            <StoreInput
              {...form.register('email')}
              id="login-email"
              type="email"
              autoComplete="email"
              iconPadLeft
              invalid={!!form.formState.errors.email}
              disabled={submitting}
              placeholder="Correo electrónico"
            />
          </div>
          {form.formState.errors.email && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {form.formState.errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-navy">
            Contraseña
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Lock size={17} />
            </span>
            <StoreInput
              {...form.register('password')}
              id="login-password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              iconPadLeft
              iconPadRight
              invalid={!!form.formState.errors.password}
              disabled={submitting}
              placeholder="Tu contraseña"
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-navy transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={() => setShowPwd((v) => !v)}
              aria-label="Mostrar u ocultar contraseña"
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {form.formState.errors.password && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {form.formState.errors.password.message}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          <label className="flex cursor-pointer items-center gap-2 min-h-[44px] -my-2 text-sm text-slate-600 select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-navy focus:ring-navy/40"
            />
            Recordarme
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-slate-500 hover:text-navy transition-colors"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={{ y: -2, boxShadow: '0 4px 12px -2px rgba(11,18,32,0.08), 0 2px 4px -2px rgba(11,18,32,0.06)' }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            'relative mt-2 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl',
            'bg-[#0B1220] text-white font-semibold tracking-tight shadow-soft hover:bg-[#111826] hover:shadow-card',
            'transition-colors duration-200 disabled:opacity-55 disabled:pointer-events-none btn-mundotech-shimmer',
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin relative z-[1]" />
              <span className="relative z-[1]">Iniciando sesión…</span>
            </>
          ) : (
            <span className="relative z-[1]">Iniciar sesión</span>
          )}
        </motion.button>
      </motion.form>

      <AuthDividerWithOAuth googleAvailable={googleAvailable} callbackUrl={callbackUrl} />

      <p className="mt-8 text-center text-sm text-slate-600">
        ¿No tienes cuenta?{' '}
        <Link href="/registro" className="font-semibold text-amber-700 hover:text-amber-800">
          Crear cuenta
        </Link>
      </p>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
        <ShieldCheck size={12} className="text-brand-green shrink-0" />
        Tus datos solo se usan para tus pedidos — nada de spam
      </p>
    </div>
  );
}

interface RegisterPanelProps {
  callbackUrl: string;
}

export function AuthRegisterForm({ callbackUrl }: RegisterPanelProps) {
  const prefersReduced = useReducedMotion();
  const router = useRouter();
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [shake, setShake] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const form = useForm<AuthRegisterValues>({
    resolver: zodResolver(authRegisterSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (!cancelled) setGoogleAvailable(Boolean(data?.google));
      })
      .catch(() => {
        if (!cancelled) setGoogleAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById('reg-name')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const triggerShake = useCallback(() => {
    setShake(true);
    window.setTimeout(() => setShake(false), 480);
  }, []);

  const finishSuccess = useCallback(async () => {
    toast({
      title: 'Sesión iniciada',
      description: 'Tu cuenta está lista. ¡Gracias por unirte!',
      variant: 'success',
    });
    router.refresh();
    const session = await getSession();
    const role = session?.user?.role?.toUpperCase?.();
    router.push(resolvePostLoginRedirect(role, callbackUrl));
  }, [callbackUrl, router]);

  const onSubmit: SubmitHandler<AuthRegisterValues> = async (data) => {
    form.clearErrors('root');
    const res = await registerUserAction({
      name: data.name,
      email: data.email,
      password: data.password,
    });
    if (!res.success) {
      form.setError('root', {
        message: res.message ?? 'No pudimos crear tu cuenta.',
      });
      triggerShake();
      return;
    }

    // PRD-253: mostrar estado persistente de "revisa tu bandeja" antes de cualquier
    // redirección — el toast efímero previo no era suficiente para que el usuario vea
    // las instrucciones. El auto-login se intenta igual; si tiene éxito, redirige.
    setRegisteredEmail(data.email);
    setRegistered(true);

    const signInResult = await signIn('credentials', {
      redirect: false,
      email: data.email,
      password: data.password,
    });
    if (!signInResult?.error) {
      await finishSuccess();
    }
    // Si falla el auto-login (p. ej. anti-enumeración), el panel de éxito ya está visible.
  };

  const pwWatch = form.watch('password');
  const strength = passwordStrengthLabel(pwWatch ?? '');
  const submitting = form.formState.isSubmitting;

  if (registered) {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-600 shadow-soft">
          <MailCheck size={30} strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-navy">¡Cuenta creada!</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-xs">
            Te enviamos un correo de bienvenida a{' '}
            <span className="font-semibold text-navy break-all">{registeredEmail}</span>.
            Revisa tu bandeja de entrada y la carpeta de spam.
          </p>
        </div>
        <Link
          href={`/login?registered=1&email=${encodeURIComponent(registeredEmail)}`}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-navy px-6 text-sm font-semibold text-white transition active:opacity-80"
        >
          Ir a iniciar sesión
        </Link>
        <p className="text-[11px] text-slate-600">
          ¿No llegó el correo?{' '}
          <button
            type="button"
            onClick={() => setRegistered(false)}
            className="font-semibold text-navy hover:underline"
          >
            Volver al formulario
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-yellow text-navy shadow-soft">
            <User size={22} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 id="register-heading" className="text-xl sm:text-2xl font-bold tracking-tight text-navy">
              Crear cuenta
            </h1>
            <p className="mt-1 text-sm text-slate-600 leading-snug">
              Toma un minuto · misma cuenta para la web y la tienda física.
            </p>
          </div>
        </div>
      </header>

      <motion.form
        animate={shake ? (prefersReduced ? { opacity: [1, 0.7, 1] } : { x: [0, -6, 6, -4, 4, 0] }) : { x: 0 }}
        transition={{ duration: prefersReduced ? 0.15 : 0.42 }}
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        aria-labelledby="register-heading"
      >
        {form.formState.errors.root && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            {form.formState.errors.root.message}
          </div>
        )}

        <div>
          <label htmlFor="reg-name" className="mb-1.5 block text-sm font-medium text-navy">
            Nombre
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <User size={17} />
            </span>
            <StoreInput
              {...form.register('name')}
              id="reg-name"
              type="text"
              autoComplete="name"
              iconPadLeft
              invalid={!!form.formState.errors.name}
              disabled={submitting}
              placeholder="Tu nombre"
            />
          </div>
          {form.formState.errors.name && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="reg-email" className="mb-1.5 block text-sm font-medium text-navy">
            Correo electrónico
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Mail size={17} />
            </span>
            <StoreInput
              {...form.register('email')}
              id="reg-email"
              type="email"
              autoComplete="email"
              iconPadLeft
              invalid={!!form.formState.errors.email}
              disabled={submitting}
              placeholder="Correo electrónico"
            />
          </div>
          {form.formState.errors.email && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {form.formState.errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="reg-password" className="mb-1.5 block text-sm font-medium text-navy">
            Contraseña
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Lock size={17} />
            </span>
            <StoreInput
              {...form.register('password')}
              id="reg-password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              iconPadLeft
              iconPadRight
              invalid={!!form.formState.errors.password}
              disabled={submitting}
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-navy transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={() => setShowPwd((v) => !v)}
              aria-label="Mostrar u ocultar contraseña"
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {form.formState.errors.password && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {form.formState.errors.password.message}
            </p>
          )}
        </div>

        {pwWatch ? (
          <div className="-mt-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors duration-300',
                    i <= strength.score
                      ? strength.score < 2
                        ? 'bg-rose-400'
                        : strength.score < 4
                          ? 'bg-amber-400'
                          : 'bg-brand-green'
                      : 'bg-slate-200',
                  )}
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Fuerza:{' '}
              <span className="font-semibold text-navy">{strength.label}</span>
            </p>
          </div>
        ) : null}

        <div>
          <label htmlFor="reg-confirm" className="mb-1.5 block text-sm font-medium text-navy">
            Confirmar contraseña
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Lock size={17} />
            </span>
            <StoreInput
              {...form.register('confirmPassword')}
              id="reg-confirm"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              iconPadLeft
              iconPadRight
              invalid={!!form.formState.errors.confirmPassword}
              disabled={submitting}
              placeholder="Repite la contraseña"
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-navy transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label="Mostrar u ocultar confirmación"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {form.formState.errors.confirmPassword && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {form.formState.errors.confirmPassword.message}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <label className="flex cursor-pointer gap-3 text-sm text-slate-700 leading-snug">
            <input
              type="checkbox"
              {...form.register('acceptTerms')}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-navy focus:ring-navy/40"
            />
            <span>
              Acepto los{' '}
              <Link href="/terms-of-service" className="font-semibold text-navy underline-offset-2 hover:underline">
                términos
              </Link>{' '}
              y el tratamiento de mis datos conforme a las políticas de MundoTech.
            </span>
          </label>
          {form.formState.errors.acceptTerms && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {form.formState.errors.acceptTerms.message}
            </p>
          )}
        </div>

        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            'mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl',
            'bg-[#FFD700] text-[#0B1220] font-semibold tracking-tight',
            'shadow-soft hover:bg-[#FFE03A] hover:shadow-card',
            'transition-all duration-200 disabled:opacity-55 disabled:pointer-events-none',
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creando cuenta…
            </>
          ) : (
            'Crear cuenta'
          )}
        </motion.button>
      </motion.form>

      <AuthDividerWithOAuth googleAvailable={googleAvailable} callbackUrl={callbackUrl} />

      <p className="mt-8 text-center text-sm text-slate-600">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-semibold text-amber-700 hover:text-amber-800">
          Inicia sesión
        </Link>
      </p>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
        <ShieldCheck size={12} className="text-brand-green shrink-0" />
        Registro gratuito · Sin cargos ocultos
      </p>
    </div>
  );
}
