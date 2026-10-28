'use server';

import { randomUUID } from 'crypto';

import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail, sendWelcomeEmail } from '@/lib/resend';
import { rateLimitCritical, hashForBucket } from '@/lib/rate-limit';
import { getActionClientIp, hashToken } from '@/lib/security';
import { logError, logInfo } from '@/lib/safe-logger';
import bcrypt from 'bcrypt';
import { BRAND } from '@/config/brand';
import { queueTransactionalEmails } from '@/lib/email-outbox-context';

function firstNameFromName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return 'Cliente';
  return t.split(/\s+/)[0] ?? t;
}

/** Mensaje único para anti-enumeración (correo válido). */
const PASSWORD_RESET_GENERIC_MESSAGE =
  `Si el correo está registrado en ${BRAND.name}, recibirás instrucciones para restablecer tu contraseña. Revisa la bandeja de entrada y el spam. El enlace expira en 15 minutos.`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RESET_EXPIRY_MS = 15 * 60 * 1000;

/** Mensaje genérico ante token inválido o expirado (sin filtrar causa). */
const RESET_INVALID_MESSAGE =
  'El enlace no es válido o ha expirado. Solicita uno nuevo desde la página de iniciar sesión.';

/**
 * PRD-013 + PRD-228: mensaje único de registro. No confirma ni niega que el
 * correo exista (anti-enumeración) y pide revisar la bandeja de entrada.
 */
const REGISTER_GENERIC_MESSAGE =
  'Solicitud procesada. Si el correo no estaba registrado, tu cuenta quedó creada y recibirás un correo de bienvenida — revisa tu bandeja (y el spam).';

export async function registerUserAction({ name, email, password }: Record<string, string>) {
  try {
    // 0. Rate limit por IP: frena bots y la enumeración de correos vía registro
    const ip = await getActionClientIp();
    if ((await rateLimitCritical(`register:${hashForBucket(ip)}`, { limit: 5, windowMs: 15 * 60_000 })).limited) {
      return {
        success: false,
        message: 'Demasiados intentos de registro. Espera unos minutos e intenta de nuevo.',
      };
    }

    // 1. Validar que los datos no estén vacíos
    if (!name || !email || !password) {
      return { success: false, message: 'Todos los campos son obligatorios.' };
    }

    // 2. Validaciones mínimas de servidor (no confiar solo en el cliente)
    // PRD-169 / PRD-238: normalizar SIEMPRE el email — el UNIQUE de PostgreSQL
    // es case-sensitive y sin esto User@mail.com y user@mail.com coexisten.
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return { success: false, message: 'Introduce un correo electrónico válido.' };
    }
    if (password.length < 8) {
      return { success: false, message: 'La contraseña debe tener al menos 8 caracteres.' };
    }

    // 3. Verificar si el usuario ya existe.
    // PRD-013: si existe, responder con el MISMO mensaje genérico de éxito —
    // un atacante no puede usar el registro para confirmar correos válidos.
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return { success: true, message: REGISTER_GENERIC_MESSAGE };
    }

    // 4. Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 12);

    // 5. Crear el usuario (rol normalizado en mayúsculas, consistente con isAdminRole)
    //
    // SEC-2026-09 (#3): ya NO se vinculan aquí los pedidos invitados hechos
    // con este email. El registro no verifica que quien se registra controle
    // el correo, así que un atacante que registrara `victima@x.com` heredaba
    // nombre, teléfono, cédula, dirección e historial de compras de la víctima
    // (y la insignia «compra verificada»). La vinculación de pedidos guest
    // exige prueba de posesión: el token del pedido (registerFromOrderAction)
    // o un flujo de verificación de correo.
    await prisma.$transaction(async tx => {
      await tx.user.create({
      data: {
        name: name.trim().slice(0, 120),
        email: normalizedEmail,
        password: hashedPassword,
        role: 'CLIENT',
      },
      select: { id: true },
      });
      await queueTransactionalEmails(tx, () => sendWelcomeEmail(normalizedEmail, firstNameFromName(name)));
    });

    return { success: true, message: REGISTER_GENERIC_MESSAGE };

  } catch (error) {
    logError('register_user_action_failed', error, { operation: 'register' });
    return { success: false, message: 'Ocurrió un error inesperado en el servidor.' };
  }
}

/**
 * FASE 4.1 (MEJORA 1.2): registro post-compra "en 1 clic" desde /checkout/success.
 *
 * El invitado consume el token guest (?token=) como bearer no adivinable.
 * SEC-2026-09 (#3): el token prueba la posesión de UN pedido, no del correo —
 * el email del pedido lo escribió quien hizo el checkout, sin verificar. Por
 * eso solo se vincula ese pedido; los demás pedidos guest con el mismo email
 * NO se transfieren (un atacante podía comprar con el email de la víctima y
 * usar su propio token para absorber el historial ajeno).
 */
const REGISTER_FROM_ORDER_GENERIC_FAILURE =
  'No pudimos crear la cuenta desde este pedido. Verifica el enlace o solicita uno nuevo.';

export async function registerFromOrderAction(
  guestToken: string,
  password: string,
): Promise<{ success: boolean; message: string; email?: string }> {
  try {
    const ip = await getActionClientIp();
    if ((await rateLimitCritical(`register-from-order:${hashForBucket(ip)}`, { limit: 5, windowMs: 15 * 60_000 })).limited) {
      return {
        success: false,
        message: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
      };
    }

    const rawToken = guestToken?.trim();
    if (!rawToken) {
      return { success: false, message: REGISTER_FROM_ORDER_GENERIC_FAILURE };
    }
    if (password.length < 8) {
      return { success: false, message: 'La contraseña debe tener al menos 8 caracteres.' };
    }

    const tokenHash = hashToken(rawToken);
    const now = new Date();

    const order = await prisma.order.findFirst({
      where: {
        guestAccessTokenHash: tokenHash,
        guestAccessTokenExpiresAt: { gt: now },
        customerId: null,
      },
      select: { id: true, customerEmail: true, customerName: true },
    });
    if (!order?.customerEmail) {
      return { success: false, message: REGISTER_FROM_ORDER_GENERIC_FAILURE };
    }

    const normalizedEmail = order.customerEmail.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return { success: false, message: REGISTER_FROM_ORDER_GENERIC_FAILURE };
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          guestAccessTokenHash: tokenHash,
          guestAccessTokenExpiresAt: { gt: now },
          customerId: null,
        },
        data: {
          guestAccessTokenHash: null,
          guestAccessTokenExpiresAt: null,
        },
      });
      if (claimed.count !== 1) return null;

      const user = await tx.user.create({
        data: {
          name: order.customerName.trim().slice(0, 120) || null,
          email: normalizedEmail,
          password: hashedPassword,
          role: 'CLIENT',
        },
        select: { id: true },
      });

      // Solo el pedido cuyo token se acaba de consumir (prueba de posesión).
      await tx.order.update({
        where: { id: order.id },
        data: { customerId: user.id },
      });
      await queueTransactionalEmails(tx, () => sendWelcomeEmail(normalizedEmail, firstNameFromName(order.customerName)));

      return user;
    });

    if (!created) {
      return { success: false, message: REGISTER_FROM_ORDER_GENERIC_FAILURE };
    }

    logInfo('register_from_order_success', { operation: 'register_from_order' });
    return {
      success: true,
      message: '¡Cuenta creada! Tus pedidos ya están vinculados.',
      email: normalizedEmail,
    };
  } catch (error) {
    logError('register_from_order_action_failed', error, { operation: 'register_from_order' });
    return { success: false, message: 'Ocurrió un error inesperado. Intenta de nuevo.' };
  }
}

/**
 * Solicitud de recuperación: no revela si el correo existe.
 * Solo valida formato de email con mensaje explícito.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
    return { ok: false, message: 'Introduce un correo electrónico válido.' };
  }

  // Rate limit por IP: evita spam de correos de reset y timing probes
  const ip = await getActionClientIp();
  if ((await rateLimitCritical(`pw-reset:${hashForBucket(ip)}`, { limit: 5, windowMs: 15 * 60_000 })).limited) {
    // Mismo mensaje genérico: no revelar siquiera el rate limit exacto
    return { ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: trimmed },
      select: { id: true },
    });

    if (user) {
      // El token claro viaja SOLO en el email; en BD se guarda el hash SHA-256.
      // Si la BD se filtra, los tokens activos no son utilizables.
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + RESET_EXPIRY_MS);
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'password-reset:' + user.id}, 0))`;
        const current = await tx.user.findUnique({ where: { id: user.id }, select: { email: true } });
        if (current?.email.trim().toLowerCase() !== trimmed) return;
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({
        data: {
          token: hashToken(token),
          userId: user.id,
          expiresAt,
        },
        });
        await queueTransactionalEmails(tx, () => sendPasswordResetEmail(trimmed, token, expiresAt));
      });
    }

    return { ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
  } catch (error) {
    logError('password_reset_request_failed', error, { operation: 'password_reset_request' });
    return {
      ok: false,
      message: 'No pudimos procesar la solicitud. Intenta de nuevo más tarde.',
    };
  }
}

/**
 * Comprueba si el token existe y no ha expirado (UI del formulario de reset).
 * Acción pública → rate limit por IP para que no sirva de oráculo de tokens.
 */
export async function verifyPasswordResetToken(token: string): Promise<boolean> {
  const t = token?.trim();
  if (!t) return false;
  try {
    const ip = await getActionClientIp();
    if ((await rateLimitCritical(`pw-reset-verify:${hashForBucket(ip)}`, { limit: 20, windowMs: 15 * 60_000 })).limited) {
      return false;
    }

    const row = await prisma.passwordResetToken.findUnique({
      where: { token: hashToken(t) },
      select: { expiresAt: true },
    });
    return Boolean(row && row.expiresAt > new Date());
  } catch (error) {
    logError('password_reset_token_verify_failed', error, {
      operation: 'password_reset_token_verify',
    });
    return false;
  }
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = token?.trim();
  const pw = newPassword ?? '';

  if (!t) {
    return { ok: false, message: RESET_INVALID_MESSAGE };
  }

  if (pw.length < 8) {
    return {
      ok: false,
      message: 'La contraseña debe tener al menos 8 caracteres.',
    };
  }

  try {
    // PRD-170: acción pública sin sesión → rate limit por IP y por token
    // (frena fuerza bruta del token y reuso agresivo si se filtró el enlace).
    const tokenHash = hashToken(t);
    const ip = await getActionClientIp();
    const [ipResult, tokenResult] = await Promise.all([
      rateLimitCritical(`pw-reset-commit:ip:${hashForBucket(ip)}`, {
        limit: 10,
        windowMs: 15 * 60_000,
      }),
      rateLimitCritical(`pw-reset-commit:token:${hashForBucket(tokenHash)}`, {
        limit: 5,
        windowMs: 15 * 60_000,
      }),
    ]);
    if (ipResult.limited || tokenResult.limited) {
      return {
        ok: false,
        message: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
      };
    }

    const row = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      select: { id: true, userId: true, expiresAt: true },
    });

    if (!row || row.expiresAt <= new Date()) {
      if (row) {
        await prisma.passwordResetToken.delete({ where: { id: row.id } }).catch((cleanupError) => {
          logError('password_reset_expired_token_cleanup_failed', cleanupError, {
            operation: 'password_reset_token_cleanup',
          });
        });
      }
      return { ok: false, message: RESET_INVALID_MESSAGE };
    }

    const hashedPassword = await bcrypt.hash(pw, 12);

    // PRD-171: consumo ATÓMICO del token. El deleteMany condicionado
    // (token + no expirado) garantiza que de dos requests concurrentes con el
    // mismo token solo una obtenga count=1 y cambie la contraseña (sin TOCTOU).
    const consumed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'password-reset:' + row.userId}, 0))`;
      const deleted = await tx.passwordResetToken.deleteMany({
        where: { token: tokenHash, expiresAt: { gt: new Date() } },
      });
      if (deleted.count === 0) return false;

      // PRD-173: bumping passwordChangedAt para que el JWT callback detecte la
      // huella obsoleta en el próximo ciclo de re-validación y fuerce re-login.
      await tx.user.update({
        where: { id: row.userId },
        data: { password: hashedPassword, passwordChangedAt: new Date() },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: row.userId },
      });
      return true;
    });

    if (!consumed) {
      return { ok: false, message: RESET_INVALID_MESSAGE };
    }

    return { ok: true };
  } catch (error) {
    logError('reset_password_failed', error, { operation: 'reset_password' });
    return {
      ok: false,
      message: 'No pudimos actualizar la contraseña. Intenta de nuevo más tarde.',
    };
  }
}
