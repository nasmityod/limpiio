'use server'

import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcrypt';
import { hashToken } from '@/lib/security';
import { sendEmailChangeConfirmEmail } from '@/lib/resend';
import { emailSiteBaseUrl } from '@/emails/mundotech/site';
import { logError } from '@/lib/safe-logger';

interface UpdateResult {
  success: boolean;
  message: string;
}

/** PRD-014/089: tiempo de validez del token de cambio de email (1 hora). */
const EMAIL_CHANGE_EXPIRY_MS = 60 * 60_000;

/**
 * PRD-089: validación Zod de servidor para el cambio de datos de perfil.
 * El email se normaliza (trim + lowercase) igual que en registro y login
 * (PRD-169/237/238) para no crear duplicados con distinto casing.
 */
const updateDetailsSchema = z.object({
  name:  z.string().trim().min(1, 'El nombre es obligatorio.').max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Introduce un correo electrónico válido.')
    .max(254),
});

export async function updateUserDetails(data: { name: string; email: string }): Promise<UpdateResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return { success: false, message: 'No autorizado.' };
  }

  const parsed = updateDetailsSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? 'Datos inválidos.',
    };
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });

    if (!currentUser) {
      return { success: false, message: 'No autorizado.' };
    }

    const emailChanged = parsed.data.email !== currentUser.email;

    if (!emailChanged) {
      // Solo cambio de nombre: se aplica directo sin verificación
      await prisma.user.update({
        where: { id: session.user.id },
        data: { name: parsed.data.name },
      });
      revalidatePath('/account/details');
      return { success: true, message: 'Nombre actualizado correctamente.' };
    }

    /*
     * PRD-014 / PRD-089: el cambio de email NO se aplica directamente.
     * Se guarda como pendiente y se envía un token de confirmación al
     * nuevo correo. Solo al confirmar el token se promueve pendingEmail → email.
     */

    // Verificar que el nuevo email no esté en uso
    const conflict = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (conflict) {
      return { success: false, message: 'El correo electrónico ya está en uso por otra cuenta.' };
    }

    const token = randomUUID();
    const tokenHash = hashToken(token);
    const expiry = new Date(Date.now() + EMAIL_CHANGE_EXPIRY_MS);

    // Actualizar nombre (si cambió) + guardar email pendiente + token
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: parsed.data.name,
        pendingEmail: parsed.data.email,
        emailChangeToken: tokenHash,
        emailChangeTokenExpiry: expiry,
      },
    });

    const base = emailSiteBaseUrl().replace(/\/$/, '');
    const confirmUrl = `${base}/api/account/confirm-email?token=${encodeURIComponent(token)}`;

    // Enviar enlace de confirmación al NUEVO correo (best-effort)
    try {
      await sendEmailChangeConfirmEmail({
        to: parsed.data.email,
        customerName: parsed.data.name || currentUser.name || 'Cliente',
        confirmUrl,
        newEmail: parsed.data.email,
      });
    } catch (emailError) {
      logError('email_change_confirm_failed', emailError, { operation: 'email_change' });
    }

    revalidatePath('/account/details');
    return {
      success: true,
      message: `Te enviamos un correo de confirmación a ${parsed.data.email}. Revisa tu bandeja y haz clic en el enlace para completar el cambio.`,
    };
  } catch (error) {
    logError('update_user_details_failed', error, { operation: 'update_details' });
    return { success: false, message: 'Ocurrió un error al guardar los datos.' };
  }
}

export async function updatePassword(data: { currentPassword?: string; newPassword?: string }): Promise<UpdateResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return { success: false, message: 'No autorizado.' };
  }

  if (!data.currentPassword || !data.newPassword) {
    return { success: false, message: 'Todos los campos son requeridos.' };
  }

  // PRD-015 / PRD-090: misma política mínima que el registro (8 caracteres),
  // aplicada en el SERVIDOR — la validación del cliente es solo cosmética.
  if (data.newPassword.length < 8) {
    return { success: false, message: 'La nueva contraseña debe tener al menos 8 caracteres.' };
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });

    if (!user || !user.password) {
      return { success: false, message: 'No se pudo encontrar al usuario o no tiene una contraseña establecida.' };
    }

    const isPasswordCorrect = await bcrypt.compare(data.currentPassword, user.password);

    if (!isPasswordCorrect) {
      return { success: false, message: 'La contraseña actual es incorrecta.' };
    }

    const hashedNewPassword = await bcrypt.hash(data.newPassword, 12);

    // PRD-173: `passwordChangedAt` bumpeado atómicamente con la contraseña.
    // El callback JWT deriva la huella (pwv) del hash bcrypt y la compara en
    // cada re-validación (cada 5 min). Al cambiar el hash, la huella difiere
    // y todas las sesiones activas quedan invalidadas en ≤5 min.
    await prisma.user.update({
      where: { id: session.user.id },
      data: { password: hashedNewPassword, passwordChangedAt: new Date() },
    });

    return { success: true, message: 'Contraseña actualizada correctamente. Por seguridad, las sesiones abiertas se cerrarán en unos minutos.' };
  } catch (error) {
    logError('update_password_failed', error, { operation: 'update_password' });
    return { success: false, message: 'Ocurrió un error al actualizar la contraseña.' };
  }
}
