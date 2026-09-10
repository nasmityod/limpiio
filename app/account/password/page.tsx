import ChangePasswordForm from '@/components/account/ChangePasswordForm';

export default function AccountPasswordPage() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-6 sm:p-8">
      <div className="mb-6 pb-6 border-b border-slate-100">
        <h1 className="text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">Cambiar contraseña</h1>
        <p className="text-sm text-slate-500 mt-1.5">
          Para tu seguridad, te recomendamos elegir una contraseña fuerte y única.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
