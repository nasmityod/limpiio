'use client';

import { Printer, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/** Controles (no imprimibles) para la etiqueta térmica: imprimir / volver. */
export default function LabelControls() {
  const router = useRouter();
  return (
    <div className="no-print flex items-center justify-between gap-3 mb-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft size={15} /> Volver
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-xl bg-navy text-white text-sm font-bold px-5 py-2.5 hover:bg-navy-700 active:scale-[0.98] transition-all"
      >
        <Printer size={16} /> Imprimir etiqueta
      </button>
    </div>
  );
}
