import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { readSettings, writeSettings, storeSettingsSchema, type StoreSettings } from '@/lib/data-store';
import { requirePermission } from '@/lib/admin-access-server';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { CACHE_TAG_SITE_SHELL, CACHE_TAG_SETTINGS } from '@/lib/site-shell-cache';
import { generalSettingsApiSchema } from '@/lib/settings-api-schemas';
import { logError } from '@/lib/safe-logger';

export async function PUT(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('STORE_SETTINGS');
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const parsed = generalSettingsApiSchema.safeParse(body);
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
        { success: false, message: 'Error al combinar configuración general.' },
        { status: 400 },
      );
    }

    await writeSettings(fullParsed.data);
    revalidatePath('/', 'layout');
    revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
    revalidateTag(CACHE_TAG_SETTINGS, 'default');
    return NextResponse.json({ success: true, message: 'Configuración general guardada.' });
  } catch (error) {
    logError('settings_general_put_failed', error, { route: '/api/settings/general', operation: 'put_general_settings' });
    return NextResponse.json(
      { success: false, message: 'Error al guardar la configuración general.' },
      { status: 500 },
    );
  }
}
