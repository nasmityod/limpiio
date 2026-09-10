import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isFullCheckout } from '@/lib/checkout-mode';
import { prisma } from '@/lib/prisma';
import { rateLimitCritical, hashForBucket } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin, hashToken, buildRateLimitedResponse } from '@/lib/security';
import { detectImageMimeFromBuffer, isAllowedProofMime } from '@/lib/detect-image-mime';
import { processImageWithFallback } from '@/lib/image-processing';
import { uploadPrivateProof, deletePrivateProof } from '@/lib/r2';
import { v4 as uuidv4 } from 'uuid';
import { logError } from '@/lib/safe-logger';

/** sharp usa módulos nativos; no compatible con Edge. */
export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/checkout/upload-proof
 *
 * Sube un comprobante de pago al bucket privado de R2.
 * Requiere header `x-checkout-upload-token` obtenido previamente de
 * /api/checkout/upload-session. El token se reclama PENDING → UPLOADING
 * y se persiste objectKey en el claim para resistir caídas del proceso.
 *
 * Tras una subida exitosa, el registro vuelve a PENDING con objectKey
 * (se vincula al pedido en el checkout).
 *
 * La respuesta NO expone proofKey: el token ya identifica el registro.
 */
export async function POST(request: Request) {
  // Mitigación CSRF (formularios cross-site con cookies de sesión)
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  // Guest solo en whatsapp / auth obligatoria en full: esta ruta solo existe
  // para el checkout full con comprobante. En whatsapp no se usa (404).
  if (!isFullCheckout) {
    return NextResponse.json({ error: 'Ruta no disponible.' }, { status: 404 });
  }

  // Cargar sesión inmediatamente: en full nunca existe rama guest.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  const userId = session.user.id;

  const rawToken = request.headers.get('x-checkout-upload-token');
  if (!rawToken?.trim()) {
    return NextResponse.json(
      { error: 'Token de subida requerido. Obtén uno en /api/checkout/upload-session.' },
      { status: 401 },
    );
  }

  const tokenHash = hashToken(rawToken.trim());

  const limitKey = `upload-proof:user:${hashForBucket(userId)}`;
  const limitCfg = { limit: 10, windowMs: 10 * 60_000 };
  const rateResult = await rateLimitCritical(limitKey, limitCfg);
  if (rateResult.limited) {
    return buildRateLimitedResponse(rateResult.retryAfterSeconds,
      'Demasiadas solicitudes de subida. Espera unos minutos.');
  }

  // Variables de control para cleanup
  let claimed = false;
  let uploadedKey: string | null = null;
  let finalized = false;

  try {
    // Leer y validar el archivo ANTES del claim
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No se proporcionó archivo.' }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `La imagen supera el máximo permitido (${MAX_BYTES / (1024 * 1024)} MB).` },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verificación de magic bytes
    const detectedMime = detectImageMimeFromBuffer(buffer);
    if (!detectedMime || !isAllowedProofMime(detectedMime)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Usa una imagen JPG, PNG o WEBP.' },
        { status: 400 },
      );
    }

    const { buffer: processed, contentType, ext, width, height } =
      await processImageWithFallback(buffer, { maxWidth: 1600 });

    // ── GENERAR KEY ANTES DEL CLAIM ───────────────────────────
    const proofKey = `proofs/${uuidv4()}.${ext}`;

    // ── RECLAMAR TOKEN: PENDING → UPLOADING (con objectKey) ──
    const claim = await prisma.paymentUpload.updateMany({
      where: {
        tokenHash,
        userId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        objectKey: null,
        orderId: null,
      },
      data: {
        status: 'UPLOADING',
        objectKey: proofKey,
      },
    });

    if (claim.count !== 1) {
      return NextResponse.json(
        {
          error:
            'Token inválido, expirado, ya utilizado o con una subida en proceso.',
        },
        { status: 409 },
      );
    }

    claimed = true;
    uploadedKey = proofKey;

    // ── SUBIR A R2 ─────────────────────────────────────────────
    await uploadPrivateProof({
      buffer: processed,
      key: proofKey,
      contentType,
    });

    // ── FINALIZAR: UPLOADING → PENDING (objectKey ya persistido) ──
    const finalizedUpload = await prisma.paymentUpload.updateMany({
      where: {
        tokenHash,
        userId,
        status: 'UPLOADING',
        objectKey: proofKey,
        orderId: null,
      },
      data: {
        status: 'PENDING',
      },
    });

    if (finalizedUpload.count !== 1) {
      throw new Error(
        '[upload-proof] No se pudo finalizar el registro del comprobante.',
      );
    }

    finalized = true;

    return NextResponse.json(
      { uploaded: true, width, height },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    logError('upload_proof_failed', err, { operation: 'upload_proof' });
    return NextResponse.json(
      { error: 'No pudimos subir el comprobante. Intenta con otra imagen o más tarde.' },
      { status: 500 },
    );
  } finally {
    // Cleanup: si el token fue reclamado pero no finalizado
    if (claimed && !finalized) {
      let objectDeleted = !uploadedKey;

      if (uploadedKey) {
        try {
          await deletePrivateProof(uploadedKey);
          objectDeleted = true;
        } catch (cleanupError) {
          const errorName =
            cleanupError instanceof Error
              ? cleanupError.name
              : 'UnknownError';

          logError('upload_proof_cleanup_failed', cleanupError, { operation: 'upload_proof_cleanup', errorName });
        }
      }

      if (objectDeleted) {
        await prisma.paymentUpload.updateMany({
          where: {
            tokenHash,
            userId,
            status: 'UPLOADING',
            objectKey: uploadedKey,
          },
          data: {
            status: 'PENDING',
            objectKey: null,
          },
        });
      }
    }
  }
}
