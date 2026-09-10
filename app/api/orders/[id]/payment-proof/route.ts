import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { getPrivateProofReadUrl, isR2PublicUrl } from '@/lib/r2';
import { logError, logWarn } from '@/lib/safe-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/[id]/payment-proof
 *
 * Devuelve una URL prefirmada (corta duración) para que el ADMIN visualice el
 * comprobante de pago. Los nuevos comprobantes se almacenan en el bucket privado;
 * los legacy (paymentProofUrl) se sirven temporalmente si el host es válido.
 *
 * SESIÓN 04 — solo ADMIN accede al comprobante.
 * Contrato de autenticación (verificado end-to-end):
 *   - Guest sin sesión: 401 (middleware.ts, isUserTokenApi intercepta antes de llegar aquí).
 *   - CLIENT autenticado sin rol ADMIN: 403 (requireAdmin() en este handler).
 *   - ADMIN: 200 con URL firmada.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('PAYMENTS');
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  if (!id?.trim()) {
    return NextResponse.json({ error: 'ID del pedido requerido.' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: { paymentProofKey: true, paymentProofUrl: true },
  });

  if (!order) {
    return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
  }

  // Prioridad: paymentProofKey (nuevo sistema privado)
  if (order.paymentProofKey) {
    try {
      const url = await getPrivateProofReadUrl(order.paymentProofKey, 180);
      return NextResponse.json(
        { url, expiresIn: 180 },
        {
          headers: {
            'Cache-Control': 'private, no-store',
            'Referrer-Policy': 'no-referrer',
          },
        },
      );
    } catch (err) {
      logError('payment_proof_signed_url_failed', err, {
        operation: 'payment_proof',
        route: '/api/orders/[id]/payment-proof',
      });
      return NextResponse.json(
        { error: 'No se pudo generar la URL del comprobante.' },
        { status: 500 },
      );
    }
  }

  // Fallback legacy: paymentProofUrl solo si el host es el R2 público configurado
  // @deprecated SESIÓN 04 — eliminar cuando se migren todos los registros legacy.
  if (order.paymentProofUrl) {
    if (isR2PublicUrl(order.paymentProofUrl)) {
      return NextResponse.json(
        { legacyUrl: order.paymentProofUrl, deprecation: 'use paymentProofKey' },
        {
          headers: {
            'Cache-Control': 'private, no-store',
            'Referrer-Policy': 'no-referrer',
          },
        },
      );
    }
    // Host ajeno: no servir la URL aunque exista en BD (seguridad)
    logWarn('payment_proof_untrusted_legacy_host', {
      operation: 'payment_proof',
      route: '/api/orders/[id]/payment-proof',
    });
  }

  return NextResponse.json({ error: 'El pedido no tiene comprobante de pago.' }, { status: 404 });
}
