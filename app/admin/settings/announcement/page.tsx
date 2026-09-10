'use client';

import { useEffect, useState, useTransition } from 'react';
import { Megaphone, Check, AlertCircle, Loader2, Power } from 'lucide-react';
import { getAnnouncement, updateAnnouncement } from '@/app/actions/announcementActions';
import type { Announcement } from '@/lib/announcement';

export default function AdminAnnouncementPage() {
  const [data, setData] = useState<Announcement>({
    active: false, text: '', link: '', bgColor: '#0B1220', textColor: '#FFFFFF',
  });
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    getAnnouncement().then((a) => { setData(a); setLoading(false); });
  }, []);

  const flash = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const save = () => {
    startTransition(async () => {
      const res = await updateAnnouncement(data);
      if (res.success) flash('success', 'Barra de anuncios guardada.');
      else flash('error', res.message);
    });
  };

  const inputClass =
    'w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy';
  const labelClass = 'block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5';

  if (loading) {
    return <div className="py-16 text-center text-gray-400 text-sm">Cargando…</div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-amber-50 text-navy flex items-center justify-center">
          <Megaphone size={22} />
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy">Barra de anuncios</h1>
          <p className="text-xs text-gray-500 mt-0.5">Mensaje superior del sitio (ofertas, envíos, avisos).</p>
        </div>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          feedback.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <Check size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Vista previa */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold uppercase tracking-wide text-gray-500">
          Vista previa
        </div>
        {data.text.trim() ? (
          <div className="text-center text-sm font-semibold px-4 py-2.5" style={{ backgroundColor: data.bgColor, color: data.textColor }}>
            {data.text}
          </div>
        ) : (
          <div className="text-center text-sm text-gray-400 px-4 py-2.5">Escribe un mensaje para previsualizar…</div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <label className={labelClass}>Estado</label>
          <button
            type="button"
            onClick={() => setData(d => ({ ...d, active: !d.active }))}
            className={`w-full min-h-[48px] rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 ${
              data.active ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-500 active:bg-gray-100'
            }`}
          >
            <Power size={14} /> {data.active ? 'Visible en el sitio' : 'Oculta'}
          </button>
        </div>

        <div>
          <label className={labelClass}>Mensaje</label>
          <input
            type="text"
            value={data.text}
            maxLength={160}
            onChange={e => setData(d => ({ ...d, text: e.target.value }))}
            placeholder="Ej: 🚚 Envío gratis en compras mayores a $50"
            className={inputClass}
          />
          <p className="text-[11px] text-gray-400 mt-1">{data.text.length}/160</p>
        </div>

        <div>
          <label className={labelClass}>Enlace <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional</span></label>
          <input
            type="text"
            value={data.link}
            maxLength={300}
            onChange={e => setData(d => ({ ...d, link: e.target.value }))}
            placeholder="/productos"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Color de fondo</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.bgColor}
                onChange={e => setData(d => ({ ...d, bgColor: e.target.value }))}
                className="w-12 h-12 rounded-lg border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={data.bgColor}
                onChange={e => setData(d => ({ ...d, bgColor: e.target.value }))}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Color de texto</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.textColor}
                onChange={e => setData(d => ({ ...d, textColor: e.target.value }))}
                className="w-12 h-12 rounded-lg border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={data.textColor}
                onChange={e => setData(d => ({ ...d, textColor: e.target.value }))}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase rounded-xl active:bg-yellow-300 disabled:opacity-60"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : null}
          Guardar barra
        </button>
      </div>
    </div>
  );
}
