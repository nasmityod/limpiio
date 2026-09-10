import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export default function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="pb-14 w-full max-w-full">
      <nav
        className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 mb-6"
        aria-label="Breadcrumb"
      >
        <Link href="/" className="text-slate-600 hover:text-navy transition-colors">
          Inicio
        </Link>
        <ChevronRight size={12} className="flex-shrink-0" aria-hidden />
        <span className="text-navy font-medium truncate">{title}</span>
      </nav>

      <article className="max-w-3xl mx-auto rounded-2xl border border-slate-200/80 bg-white shadow-soft px-6 py-8 sm:px-10 sm:py-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{lastUpdated}</p>

        <div className="mt-8 text-sm sm:text-[15px] text-slate-600 leading-relaxed space-y-6 [&_h2]:text-base [&_h2]:sm:text-lg [&_h2]:font-bold [&_h2]:text-navy [&_h2]:mt-10 [&_h2]:mb-3 [&_h2:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_a]:text-navy [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-[#9a7b00] [&_strong]:text-navy [&_strong]:font-semibold">
          {children}
        </div>
      </article>
    </div>
  );
}
