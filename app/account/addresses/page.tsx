import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getSavedAddresses } from '@/app/actions/addressActions';
import AddressListClient from '@/components/account/AddressListClient';

export const metadata = {
  title: 'Mis direcciones — MundoTech',
};

export default async function AddressesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-8">
        <h1 className="text-xl font-semibold text-navy">Sesión requerida</h1>
        <p className="text-sm text-slate-500 mt-2">Debes iniciar sesión para ver esta página.</p>
      </div>
    );
  }

  const addresses = await getSavedAddresses();

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-6 sm:p-8">
      <AddressListClient initialAddresses={addresses} />
    </div>
  );
}
