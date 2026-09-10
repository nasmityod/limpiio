import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { readSettings, writeSettings, storeSettingsSchema, type StoreSettings } from '@/lib/data-store';
import { requirePermission } from '@/lib/admin-access-server';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { CACHE_TAG_SITE_SHELL, CACHE_TAG_SETTINGS } from '@/lib/site-shell-cache';
import { financialSettingsApiSchema } from '@/lib/settings-api-schemas';
import { logError } from '@/lib/safe-logger';

export async function PUT(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('FINANCIAL_SETTINGS');
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const parsed = financialSettingsApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: 'Datos inválidos.', errors: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const current = await readSettings();
    const merged: StoreSettings = {
      ...current,
      ...parsed.data,
    };

    const fullParsed = storeSettingsSchema.safeParse(merged);
    if (!fullParsed.success) {
      return NextResponse.json(
        { success: false, message: 'Error al combinar configuración financiera.' },
        { status: 400 },
      );
    }

    await writeSettings(fullParsed.data);
    revalidatePath('/', 'layout');
    revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
    revalidateTag(CACHE_TAG_SETTINGS, 'default');
    return NextResponse.json({ success: true, message: 'Configuración financiera guardada.' });
  } catch (error) {
    logError('settings_financial_put_failed', error, { route: '/api/settings/financial', operation: 'put_financial_settings' });
    return NextResponse.json(
      { success: false, message: 'Error al guardar la configuración financiera.' },
      { status: 500 },
    );
  }
}
