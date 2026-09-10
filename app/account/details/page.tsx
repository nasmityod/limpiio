import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import UserDetailsForm from '@/components/account/UserDetailsForm';

const emailChangeBanners: Record<string, { type: 'success' | 'error' | 'info'; text: string }> = {
  success:      { type: 'success', text: '¡Correo actualizado! Tu nueva dirección ya está activa. Por seguridad tu sesión se cerrará en unos minutos.' },
  expired:      { type: 'error',   text: 'El enlace de confirmación expiró. Puedes solicitar un nuevo cambio de correo.' },
  invalid:      { type: 'error',   text: 'El enlace no es válido. Verifica que copiaste la URL completa del correo.' },
  conflict:     { type: 'error',   text: 'El correo ya está en uso por otra cuenta. Elige una dirección diferente.' },
  error:        { type: 'error',   text: 'Ocurrió un error al confirmar el correo. Intenta de nuevo más tarde.' },
  'rate-limited': { type: 'error', text: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AccountDetailsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;
  const emailChange = typeof params.emailChange === 'string' ? params.emailChange : null;
  const banner = emailChange ? emailChangeBanners[emailChange] : null;

  if (!session || !session.user) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-8">
        <h1 className="text-xl font-semibold text-navy">Sesión requerida</h1>
        <p className="text-sm text-slate-500 mt-2">Debes iniciar sesión para ver esta página.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-6 sm:p-8">
      <div className="mb-6 pb-6 border-b border-slate-100">
        <h1 className="text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">Mi perfil</h1>
        <p className="text-sm text-slate-500 mt-1.5">Actualiza tu información personal y de contacto.</p>
      </div>

      {banner && (
        <div
          role="alert"
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
            banner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : banner.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
        >
          {banner.text}
        </div>
      )}

      <UserDetailsForm user={session.user} />
    </div>
  );
}
