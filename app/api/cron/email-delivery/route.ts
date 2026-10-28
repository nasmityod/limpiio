import { NextResponse } from 'next/server';
import { processEmailDeliveries, purgeTerminalEmailDeliveries } from '@/lib/email-delivery';
import { verifyBearerSecret } from '@/lib/security';
import { logError } from '@/lib/safe-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: 'Cron no configurado.' }, { status: 503 });
  if (!verifyBearerSecret(request, secret)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  try {
    const result = await processEmailDeliveries(undefined, 50);
    const purged = await purgeTerminalEmailDeliveries();
    return NextResponse.json({ ok: result.failed === 0 && result.review === 0, ...result, purged });
  } catch (error) {
    logError('email_delivery_cron_failed', error, { operation: 'email_delivery' });
    return NextResponse.json({ error: 'No se pudo procesar la cola.' }, { status: 500 });
  }
}
