import { NextResponse } from 'next/server';
import { createWriteStream } from 'fs';
import { mkdtemp, rm, open } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { requirePermission } from '@/lib/admin-access-server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import {
  detectVideoContainerFromBuffer,
  isAllowedVideoExtension,
} from '@/lib/detect-video-mime';
import {
  extractPoster,
  probeVideo,
  transcodeVideo,
} from '@/lib/video-processing';
import {
  buildKey,
  uploadToR2,
  R2_PUBLIC_BASE_URL,
} from '@/lib/r2';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import { deleteFromR2, keyFromR2PublicUrl } from '@/lib/r2';
import { z } from 'zod';
import { logError } from '@/lib/safe-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BYTES = 95 * 1024 * 1024; // 95 MB — debajo del límite Cloudflare 100 MB
const STALE_JOB_MS = 10 * 60_000;

const deleteVideoSchema = z.object({
  url: z.string().url(),
  posterUrl: z.string().url().optional(),
});

async function safeDeleteR2Key(key: string, label: string): Promise<void> {
  try {
    await deleteFromR2(key);
  } catch (err) {
    logError('upload_video_r2_delete_failed', err, { provider: 'r2', operation: `delete_${label}` });
  }
}

async function deleteVideoAssets(url: string, posterUrl?: string): Promise<void> {
  const videoKey = keyFromR2PublicUrl(url);
  if (videoKey) await safeDeleteR2Key(videoKey, 'video');

  if (posterUrl) {
    const posterKey = keyFromR2PublicUrl(posterUrl);
    if (posterKey) await safeDeleteR2Key(posterKey, 'poster');
  }

  try {
    await prisma.videoJob.updateMany({
      where: { videoUrl: url },
      data: { status: 'DELETED' },
    });
  } catch (err) {
    logError('upload_video_job_mark_failed', err, { operation: 'mark_video_deleted' });
  }
}

/** Marca trabajos PROCESSING antiguos como FAILED (reinicio del servidor o timeout). */
async function markStaleVideoJobsFailed(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  await prisma.videoJob.updateMany({
    where: {
      status: 'PROCESSING',
      updatedAt: { lt: cutoff },
    },
    data: {
      status: 'FAILED',
      error: 'Procesamiento interrumpido (timeout o reinicio del servidor).',
    },
  });
}

void markStaleVideoJobsFailed();

async function streamFileToDisk(
  file: File,
  destPath: string,
): Promise<void> {
  const webStream = file.stream();
  const nodeStream = Readable.fromWeb(webStream as import('stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(destPath));
}

async function validateVideoHeader(filePath: string): Promise<void> {
  const fh = await open(filePath, 'r');
  const header = Buffer.alloc(12);
  await fh.read(header, 0, 12, 0);
  await fh.close();
  if (!detectVideoContainerFromBuffer(header)) {
    throw new Error('Tipo de archivo no permitido. Solo se aceptan videos MP4, MOV, WebM, AVI o MKV.');
  }
}

async function processVideoJob(
  jobId: string,
  inputPath: string,
  videoKey: string,
  posterKey: string,
  tmpDir: string,
): Promise<void> {
  const outputPath = join(tmpDir, 'output.mp4');
  const posterJpgPath = join(tmpDir, 'poster.jpg');

  try {
    await probeVideo(inputPath);
    await transcodeVideo(inputPath, outputPath);
    const probe = await probeVideo(outputPath);
    const poster = await extractPoster(inputPath, posterJpgPath);

    const mp4Buffer = await readFile(outputPath);
    await uploadToR2({
      buffer: mp4Buffer,
      key: videoKey,
      contentType: 'video/mp4',
    });
    await uploadToR2({
      buffer: poster.buffer,
      key: posterKey,
      contentType: poster.contentType,
    });

    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: 'READY',
        width: probe.width,
        height: probe.height,
        durationS: probe.durationS,
        error: null,
      },
    });
  } catch (err) {
    logError('upload_video_job_failed', err, { operation: 'process_video_job' });
    const message =
      err instanceof Error ? err.message : 'Error desconocido al procesar el video.';
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: message },
    });
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      logError('upload_video_temp_cleanup_failed', cleanupErr, { operation: 'cleanup_temp' });
    }
  }
}

export async function POST(request: Request) {
  if (!rejectInvalidMutationOrigin(request)) {
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  }

  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  const ip = getClientIp(request);
  if (await rateLimit(`admin-upload-video:${ip}`, { limit: 20, windowMs: 10 * 60_000 })) {
    return NextResponse.json(
      { error: 'Demasiadas subidas de video en poco tiempo. Espera unos minutos.' },
      { status: 429 },
    );
  }

  let tmpDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No se proporcionó archivo.' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `El video supera el tamaño máximo permitido (95 MB). Tamaño recibido: ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
        },
        { status: 413 },
      );
    }

    if (!isAllowedVideoExtension(file.name)) {
      return NextResponse.json(
        { error: 'Extensión no permitida. Usa MP4, MOV, WebM, AVI o MKV.' },
        { status: 415 },
      );
    }

    tmpDir = await mkdtemp(join(tmpdir(), 'mundotech-video-'));
    const inputPath = join(tmpDir, 'input');

    await streamFileToDisk(file, inputPath);
    await validateVideoHeader(inputPath);

    const rawName = formData.get('name') ?? formData.get('slug');
    const descriptiveName =
      typeof rawName === 'string' && rawName.trim() ? rawName.trim() : undefined;

    const videoKey = buildKey('products', 'mp4', descriptiveName);
    const posterKey = buildKey('products', 'webp', descriptiveName);
    const videoUrl = `${R2_PUBLIC_BASE_URL}/${videoKey}`;
    const posterUrl = `${R2_PUBLIC_BASE_URL}/${posterKey}`;

    const job = await prisma.videoJob.create({
      data: {
        status: 'PROCESSING',
        videoUrl,
        posterUrl,
      },
    });

    const workDir = tmpDir;
    tmpDir = null;

    void processVideoJob(job.id, inputPath, videoKey, posterKey, workDir);

    return NextResponse.json({
      jobId: job.id,
      status: 'processing',
      url: videoUrl,
      posterUrl,
    });
  } catch (err) {
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    logError('upload_video_post_error', err, { operation: 'upload_video_post' });
    const message =
      err instanceof Error ? err.message : 'Error al subir el video.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!rejectInvalidMutationOrigin(request)) {
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  }

  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  const ip = getClientIp(request);
  if (await rateLimit(`admin-delete-video:${ip}`, { limit: 30, windowMs: 10 * 60_000 })) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Espera unos minutos.' },
      { status: 429 },
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = deleteVideoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    }

    await deleteVideoAssets(parsed.data.url, parsed.data.posterUrl);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError('upload_video_delete_error', err, { operation: 'delete_video' });
    return NextResponse.json({ error: 'Error al eliminar el video.' }, { status: 500 });
  }
}
