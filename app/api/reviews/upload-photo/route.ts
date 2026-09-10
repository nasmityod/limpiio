import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { rateLimit } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { detectImageMimeFromBuffer, isAllowedProofMime } from '@/lib/detect-image-mime';
import { processImageWithFallback } from '@/lib/image-processing';
import { buildKey, uploadToR2 } from '@/lib/r2';
import { logError } from '@/lib/safe-logger';

/** sharp usa módulos nativos; no compatible con Edge. */
export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId || userId === 'guest') {
    return NextResponse.json(
      { error: 'Debes iniciar sesión para subir fotos.' },
      { status: 401 },
    );
  }

  if (await rateLimit(`reviews:upload-photo:${userId}`, { limit: 20, windowMs: 10 * 60_000 })) {
    return NextResponse.json(
      { error: 'Demasiadas subidas. Espera unos minutos.' },
      { status: 429 },
    );
  }

  try {
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

    // Magic-bytes: única fuente confiable del tipo real (igual que upload-proof).
    const detectedMime = detectImageMimeFromBuffer(buffer);
    if (!detectedMime || !isAllowedProofMime(detectedMime)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Usa una imagen JPG, PNG o WEBP.' },
        { status: 400 },
      );
    }

    const { buffer: processed, contentType, ext, width, height } = await processImageWithFallback(
      buffer,
      { maxWidth: 1600 },
    );
    const key = buildKey('reviews', ext);
    const url = await uploadToR2({ buffer: processed, key, contentType });

    return NextResponse.json({ url, publicId: key, width, height });
  } catch (err) {
    logError('reviews_upload_photo_failed', err, { operation: 'review_photo_upload' });
    return NextResponse.json(
      { error: 'No pudimos subir la foto. Intenta con otra imagen o más tarde.' },
      { status: 500 },
    );
  }
}
