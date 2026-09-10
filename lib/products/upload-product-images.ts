'use client';

/**
 * Subida de la galería de producto: varias imágenes, cada una independiente.
 *
 * Qué estaba mal antes
 * ────────────────────
 * `AddProductModal` recorría el `FileList` en un bucle `for … of` secuencial,
 * subía el `File` **original** (sin pasar por `normalizeImageForUpload`, que sí
 * usan `PhotoUploader` y el resto del panel) y, en cuanto una respuesta no era
 * OK, hacía `alert(...)` + `break`: el resto de la selección ni se intentaba.
 * Combinado con el límite de 5 MB por archivo del servidor, seleccionar varias
 * fotos de cámara producía el síntoma reportado —«si el peso conjunto supera
 * ~5 MB da error»—, aunque el límite nunca fue agregado: fallaba la primera
 * foto pesada y el `break` cancelaba las siguientes.
 *
 * Qué hace ahora
 * ──────────────
 * • Normaliza **cada archivo por separado** (HEIC→JPEG, orientación, reescalado
 *   y compresión progresiva; los GIF se dejan intactos).
 * • Sube con concurrencia limitada. 2–3 peticiones en vuelo aprovechan la
 *   latencia móvil sin apilar trabajos de `sharp` en el VPS ni consumir el rate
 *   limit de golpe; 1 sola sería innecesariamente lento y 10 saturarían.
 * • Un fallo afecta SÓLO a ese archivo: los demás continúan y las URLs ya
 *   obtenidas se conservan.
 * • Informa el estado de cada archivo (`pending`/`processing`/`uploading`/
 *   `done`/`error`) para que la UI lo muestre imagen a imagen.
 */

import { normalizeImageForUpload } from '@/lib/client-image-normalize';
import { CLIENT_IMAGE_TARGET_BYTES } from '@/lib/upload-limits';

/** Peticiones simultáneas contra /api/upload. */
export const UPLOAD_CONCURRENCY = 3;

export type UploadItemStatus = 'pending' | 'processing' | 'uploading' | 'done' | 'error';

export interface UploadItemState {
  /** Posición en la selección original — determina el orden final en la galería. */
  index: number;
  name: string;
  status: UploadItemStatus;
  url?: string;
  error?: string;
}

export interface UploadProductImagesOptions {
  files: File[];
  /** Carpeta lógica en R2 (`purpose` de /api/upload). */
  purpose?: string;
  /** Nombre descriptivo para la clave del objeto (título del producto). */
  descriptiveName?: string;
  concurrency?: number;
  /** Se llama en cada cambio de estado con la lista COMPLETA (misma longitud que `files`). */
  onProgress?: (items: UploadItemState[]) => void;
  signal?: AbortSignal;
}

export interface UploadProductImagesResult {
  /** URLs subidas correctamente, en el orden de selección original. */
  urls: string[];
  items: UploadItemState[];
  failed: UploadItemState[];
}

async function uploadOne(
  file: File,
  purpose: string,
  descriptiveName: string | undefined,
  signal: AbortSignal | undefined,
): Promise<string> {
  const fd = new FormData();
  fd.append('file', file, file.name || 'imagen.jpg');
  fd.append('purpose', purpose);
  if (descriptiveName) fd.append('name', descriptiveName);

  const res = await fetch('/api/upload', { method: 'POST', body: fd, signal });
  let data: { url?: string; error?: string } = {};
  try {
    data = (await res.json()) as { url?: string; error?: string };
  } catch {
    /* respuesta no JSON (p. ej. 413 del proxy) */
  }
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? `No se pudo subir la imagen (HTTP ${res.status}).`);
  }
  return data.url;
}

export async function uploadProductImages({
  files,
  purpose = 'product',
  descriptiveName,
  concurrency = UPLOAD_CONCURRENCY,
  onProgress,
  signal,
}: UploadProductImagesOptions): Promise<UploadProductImagesResult> {
  const items: UploadItemState[] = files.map((file, index) => ({
    index,
    name: file.name || `Imagen ${index + 1}`,
    status: 'pending',
  }));

  const emit = () => onProgress?.(items.map((item) => ({ ...item })));
  emit();

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= files.length) return;
      if (signal?.aborted) {
        items[index] = { ...items[index], status: 'error', error: 'Subida cancelada.' };
        emit();
        continue;
      }

      const file = files[index];
      try {
        items[index] = { ...items[index], status: 'processing' };
        emit();

        const normalized = await normalizeImageForUpload(file, {
          maxOutputBytes: CLIENT_IMAGE_TARGET_BYTES,
        });

        items[index] = { ...items[index], status: 'uploading' };
        emit();

        const url = await uploadOne(normalized, purpose, descriptiveName, signal);
        items[index] = { ...items[index], status: 'done', url };
        emit();
      } catch (err) {
        // El fallo se aísla en este archivo: el bucle continúa con el siguiente.
        items[index] = {
          ...items[index],
          status: 'error',
          error: err instanceof Error ? err.message : 'Error desconocido al subir.',
        };
        emit();
      }
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, files.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  const urls = items
    .filter((item): item is UploadItemState & { url: string } => item.status === 'done' && !!item.url)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.url);

  return { urls, items, failed: items.filter((item) => item.status === 'error') };
}

/** URLs completadas hasta el momento, en el orden de selección original. */
export function completedUrlsInOrder(items: UploadItemState[]): string[] {
  return items
    .filter((item): item is UploadItemState & { url: string } => item.status === 'done' && !!item.url)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.url);
}
