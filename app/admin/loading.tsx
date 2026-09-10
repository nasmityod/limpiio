import { Loader2 } from 'lucide-react';

export default function AdminLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Loader2 className="h-9 w-9 animate-spin text-navy/30" aria-hidden />
      <p className="text-sm font-medium text-slate-500">Cargando…</p>
    </div>
  );
}
