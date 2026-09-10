import { Suspense } from 'react';

import LoginClient from './LoginClient';
import {
  computeLoginLandingFromSources,
  resolveSearchParamGetter,
} from '@/lib/auth-path';
import { readLoginReturnPathFromPromotedHeader } from '@/lib/login-return-cookie';

function LoginFallback() {
  return (
    <div className="min-h-[45vh] rounded-3xl border border-slate-200/80 bg-white/60 animate-pulse" />
  );
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage(props: PageProps) {
  const resolved = props.searchParams ? await props.searchParams : {};
  const getParam = resolveSearchParamGetter(resolved);
  const cookiePath = await readLoginReturnPathFromPromotedHeader();
  const landing = computeLoginLandingFromSources(getParam, cookiePath);

  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient serverCallbackUrl={landing.callbackUrl} />
    </Suspense>
  );
}
