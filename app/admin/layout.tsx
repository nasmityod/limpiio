import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import AdminShell from '@/components/admin/AdminShell';
import { requireBackofficeAction } from '@/lib/admin-access-server';
import { readSettings } from '@/lib/data-store';
import { readSiteContent } from '@/lib/site-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'MundoTech Admin',
  robots: { index: false, follow: false },
  manifest: '/admin-manifest.json',
  themeColor: '#000000',
  appleWebApp: {
    title: 'MT Admin',
    statusBarStyle: 'black-translucent' as const,
    capable: true,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: '#000000',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  let access;
  try {
    access = await requireBackofficeAction();
  } catch {
    redirect('/');
  }

  const [settings, siteContent] = await Promise.all([readSettings(), readSiteContent()]);
  const slogan = siteContent.brandStrip.enabled
    ? siteContent.brandStrip.slogan.trim()
    : '';

  return (
    <AdminShell
      access={access}
      userName={session.user?.name ?? undefined}
      userEmail={session.user?.email ?? undefined}
      branding={{
        storeName: settings.storeName,
        slogan,
        address: settings.address,
      }}
    >
      {children}
    </AdminShell>
  );
}
