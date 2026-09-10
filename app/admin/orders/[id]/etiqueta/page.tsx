import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { readSettings } from '@/lib/data-store';
import { code128 } from '@/lib/barcode-code128';
import LabelControls from './LabelControls';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function OrderLabelPage({ params }: PageProps) {
  const { id } = await params;
  const [order, settings] = await Promise.all([
    prisma.order.findUnique({ where: { id }, include: { items: true } }),
    readSettings(),
  ]);

  if (!order) notFound();

  const orderRef = String(order.orderNumber).padStart(4, '0');
  // PRD-269: el payload incluye un sufijo corto derivado del id del pedido —
  // evita confusión/colisión visual de números de 4 dígitos en escaneo manual.
  const barcodeValue = `${orderRef}-${order.id.slice(-4).toUpperCase()}`;
  const barcode = code128(barcodeValue, { moduleWidth: 2, height: 56, quietZone: 8 });
  const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const groupedItems = Object.values(
    order.items.reduce<Record<string, { name: string; quantity: number }>>((acc, it) => {
      const key = it.productId || it.productName;
      (acc[key] ??= { name: it.productName, quantity: 0 }).quantity += it.quantity;
      return acc;
    }, {})
  );
  const isMrw = /mrw/i.test(order.shippingAddress) || /mrw/i.test(order.trackingCarrier ?? '');
  const isZoom = /zoom/i.test(order.shippingAddress) || /zoom/i.test(order.trackingCarrier ?? '');
  const pageW  = Number(settings.labelWidthMm) || 100;
  const pageH  = Number(settings.labelHeightMm) || 150;
  const labelW = Math.min(pageW, 100); // etiqueta compacta en hojas grandes

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 print:bg-white print:p-0">
      {/* CSS de impresión: oculta el chrome del admin y fija el tamaño térmico */}
      <style>{`
        @media print {
          @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
          html, body {
            background:#fff !important;
            margin:0 !important; padding:0 !important;
            min-height:0 !important; height:auto !important;
          }
          /* Anula min-h-[100dvh] / min-h-screen que generan páginas extra */
          body * { min-height: 0 !important; }
          main { padding: 0 !important; }
          /* Controles y avisos no se imprimen */
          .no-print { display: none !important; }
          /* La etiqueta fluye normal (SIN position:fixed → no se repite) */
          #thermal-label {
            position: static !important;
            width: ${labelW}mm !important;
            margin: 0 auto !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="max-w-[420px] mx-auto">
        <LabelControls />

        {/* Etiqueta — ~100mm de ancho */}
        <div
          id="thermal-label"
          className="bg-white text-black mx-auto border border-black/80"
          style={{ width: `${labelW}mm`, padding: '4mm', fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          {/* Cabecera */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '2mm' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, lineHeight: 1 }}>{settings.storeName}</div>
              <div style={{ fontSize: '9px', marginTop: '1mm' }}>Etiqueta de envío</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px' }}>Pedido</div>
              <div style={{ fontSize: '20px', fontWeight: 800, lineHeight: 1 }}>#{orderRef}</div>
              <div style={{ fontSize: '9px' }}>{formatDate(order.createdAt)}</div>
            </div>
          </div>

          {/* Destinatario */}
          <div style={{ marginTop: '3mm' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Destinatario</div>
            <div style={{ fontSize: '17px', fontWeight: 800, lineHeight: 1.15, marginTop: '0.5mm' }}>{order.customerName}</div>
            <div style={{ fontSize: '12px', marginTop: '1mm', lineHeight: 1.35 }}>
              {order.customerIdNumber && <div>C.I./RIF: {order.customerIdNumber}</div>}
              {order.customerPhone && <div>Tel: {order.customerPhone}</div>}
            </div>
            <div style={{ fontSize: '13px', marginTop: '1.5mm', lineHeight: 1.35, fontWeight: 600 }}>
              <div>{order.shippingAddress}</div>
              <div>
                {[order.shippingCity, order.shippingState].filter((s) => s && s !== 'N/A').join(', ')}
              </div>
              <div>{order.shippingCountry}</div>
            </div>
          </div>

          {/* Transportista / método */}
          <div style={{ marginTop: '2.5mm', display: 'flex', gap: '3mm', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '2mm 0' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>Envío</div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>
                {order.trackingCarrier || (isMrw ? 'MRW' : isZoom ? 'ZOOM' : 'Retiro / Encomienda')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>Bultos</div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>{itemCount} art.</div>
            </div>
          </div>

          {order.trackingNumber && (
            <div style={{ marginTop: '1.5mm', fontSize: '12px' }}>
              <span style={{ fontWeight: 700 }}>Guía: </span>
              <span style={{ fontFamily: 'monospace' }}>{order.trackingNumber}</span>
            </div>
          )}

          {/* Contenido del pedido — qué compró (cantidades agrupadas) */}
          <div style={{ marginTop: '3mm' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contenido</div>
            <div style={{ fontSize: '11px', lineHeight: 1.35, marginTop: '2px' }}>
              {groupedItems.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ fontWeight: 700, minWidth: '24px' }}>{it.quantity}×</span>
                  <span>{it.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Código de barras */}
          <div style={{ marginTop: '3mm', textAlign: 'center' }}>
            <svg
              width="100%"
              height={barcode.height}
              viewBox={`0 0 ${barcode.width} ${barcode.height}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Código de barras del pedido ${barcodeValue}`}
            >
              <rect x={0} y={0} width={barcode.width} height={barcode.height} fill="#fff" />
              {barcode.bars.map((b, i) => (
                <rect key={i} x={b.x} y={0} width={b.width} height={barcode.height} fill="#000" />
              ))}
            </svg>
            <div style={{ fontSize: '12px', fontFamily: 'monospace', letterSpacing: '2px', marginTop: '0.5mm' }}>
              {barcodeValue}
            </div>
          </div>

          {/* Remitente */}
          <div style={{ marginTop: '3mm', borderTop: '1px solid #000', paddingTop: '2mm', fontSize: '10px', lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>Remite: </span>
            {settings.storeName}
            {settings.phone ? ` · ${settings.phone}` : ''}
            {settings.address ? ` · ${settings.address}` : ''}
          </div>

          {/* PRD-266: la etiqueta lleva cédula/teléfono/dirección del cliente */}
          <div style={{ marginTop: '1.5mm', fontSize: '7px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Documento confidencial — contiene datos personales del destinatario
          </div>
        </div>

        <p className="no-print text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
          Esta etiqueta contiene datos personales del cliente (C.I., teléfono y dirección).
          No la dejes a la vista en el mostrador y destruye las copias dañadas o de prueba.
        </p>

        <p className="no-print text-center text-xs text-gray-400 mt-2">
          Configura tu impresora térmica a 100×150&nbsp;mm (4×6&quot;). El navegador recordará el tamaño tras la primera impresión.
        </p>
      </div>
    </div>
  );
}
