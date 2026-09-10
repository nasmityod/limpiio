'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

import AuthSplitLayout from '@/components/auth/AuthSplitLayout';
import { AuthRegisterForm } from '@/components/auth/MundoTechAuthForms';
import {
  readFreshStashedLoginRedirectPath,
  clearStashedLoginRedirectPath,
  resolveLoginCallbackFromParams,
  resolvePostLoginRedirect,
} from '@/lib/auth-path';
import { Loader2 } from 'lucide-react';

interface Props {
  serverCallbackUrl: string;
}

export default function RegistroClient({ serverCallbackUrl }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const paramsKey = params.toString();
  const { status, data: session } = useSession();

  const [callbackUrl, setCallbackUrl] = useState(serverCallbackUrl);

  useEffect(() => {
    const nextOrCbExplicit =
      (params.get('next') ?? '').length > 0 || (params.get('callbackUrl') ?? '').length > 0;

    if (nextOrCbExplicit) {
      const urlBased = resolveLoginCallbackFromParams(params.get.bind(params));
      setCallbackUrl(urlBased !== '/' ? urlBased : '/');

      const q = new URLSearchParams(params.toString());
      if (q.has('next') || q.has('callbackUrl')) {
        q.delete('next');
        q.delete('callbackUrl');
        const tail = q.toString();
        router.replace(tail ? `/registro?${tail}` : '/registro', { scroll: false });
      }

      return;
    }

    const stashed = readFreshStashedLoginRedirectPath();
    if (stashed) {
      setCallbackUrl(stashed);
      return;
    }

    setCallbackUrl(serverCallbackUrl);
  }, [paramsKey, params, serverCallbackUrl, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !session) return;
    clearStashedLoginRedirectPath();
    const role = session.user?.role?.toUpperCase?.();
    router.replace(resolvePostLoginRedirect(role, callbackUrl));
  }, [status, session, router, callbackUrl]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16">
        <Loader2 className="h-9 w-9 animate-spin text-navy/40" aria-hidden />
        <p className="text-sm font-medium text-slate-500">Cargando sesión…</p>
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-yellow" aria-hidden />
        <p className="text-sm text-slate-600">Redirigiendo…</p>
      </div>
    );
  }

  return (
    <AuthSplitLayout variant="register" breadcrumbLast="Registro">
      <AuthRegisterForm callbackUrl={callbackUrl} />
    </AuthSplitLayout>
  );
}
