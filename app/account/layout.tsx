import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import AccountSidebar from '@/components/account/AccountSidebar';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-12">
      <nav className="flex items-center gap-2 text-xs text-slate-400 mb-6" aria-label="Breadcrumb">
        <Link href="/" className="text-slate-600 hover:text-navy transition-colors">Inicio</Link>
        <ChevronRight size={12} />
        <span className="text-navy font-medium">Mi cuenta</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-3">
          <div className="lg:sticky lg:top-[96px]">
            <AccountSidebar />
          </div>
        </div>

        <div className="lg:col-span-9">{children}</div>
      </div>
    </div>
  );
}
