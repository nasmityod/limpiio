import { NextResponse } from 'next/server';
import { readSettings } from '@/lib/data-store';
import { requirePermission } from '@/lib/admin-access-server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  pickFinancialSettingsDto,
  pickGeneralSettingsDto,
} from '@/lib/settings-api-schemas';

/**
 * GET /api/settings
 * - Público: subset mínimo de contacto.
 * - STORE_SETTINGS: DTO general exclusivo.
 * - FINANCIAL_SETTINGS: DTO financiero exclusivo.
 * - Ambos permisos o Superadmin: ambos DTOs.
 */
export async function GET(request: Request) {
  const storeAuth = await requirePermission('STORE_SETTINGS');
  const financialAuth = await requirePermission('FINANCIAL_SETTINGS');
  const canStore = storeAuth.authorized;
  const canFinancial = financialAuth.authorized;

  if (!canStore && !canFinancial) {
    const ip = getClientIp(request);
    if (await rateLimit(`settings:get:${ip}`, { limit: 60, windowMs: 60_000 })) {
      return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
    }
    const settings = await readSettings();
    return NextResponse.json({
      storeName: settings.storeName,
      phone:     settings.phone,
      email:     settings.email,
    });
  }

  const settings = await readSettings();
  const payload: Record<string, unknown> = {};

  if (canStore) {
    Object.assign(payload, pickGeneralSettingsDto(settings));
  }
  if (canFinancial) {
    Object.assign(payload, pickFinancialSettingsDto(settings));
  }

  return NextResponse.json(payload);
}
