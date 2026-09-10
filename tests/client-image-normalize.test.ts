/** @vitest-environment jsdom */
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  isGifFile,
  isHeicFile,
  NormalizeImageError,
  normalizeImageForUpload,
} from '@/lib/client-image-normalize';
import {
  CLIENT_IMAGE_TARGET_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_UPLOAD_IMAGE_BYTES,
} from '@/lib/upload-limits';

/**
 * RC-06 de la auditoría de rendimiento del Panel Admin (bug de las imágenes).
 *
 * Cada archivo se valida y normaliza POR SEPARADO. En ningún punto existe un
 * límite sobre la suma de una selección múltiple.
 */

const MB = 1024 * 1024;

function makeFile(name: string, sizeBytes: number, type: string): File {
  // Un Blob con `size` simulado: no hace falta materializar 8 MB en memoria
  // para ejercitar la lógica de tamaños.
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
  return file;
}

/**
 * Simula el pipeline `createImageBitmap` → `<canvas>` → `toBlob`.
 *
 * `stepSizes` es el tamaño (en bytes) que produce cada intento sucesivo de
 * reescalado/compresión. Los blobs llevan bytes reales porque
 * `new File([blob], …)` recalcula el tamaño a partir del contenido.
 */
function stubCanvas(stepSizes: number[]) {
  const drawn: { width: number; height: number; quality: number }[] = [];

  vi.stubGlobal('createImageBitmap', async () =>
    ({ width: 4032, height: 3024, close: () => {} }) as unknown as ImageBitmap,
  );

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage: () => {} }) as unknown as CanvasRenderingContext2D,
  );

  let step = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
    _type?: string,
    quality?: number,
  ) {
    const size = stepSizes[Math.min(step, stepSizes.length - 1)];
    step++;
    drawn.push({ width: this.width, height: this.height, quality: quality ?? 1 });
    cb(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
  } as HTMLCanvasElement['toBlob']);

  return drawn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('límites de tamaño: siempre por archivo', () => {
  it('el objetivo del cliente queda por debajo del límite del servidor', () => {
    expect(CLIENT_IMAGE_TARGET_BYTES).toBeLessThan(MAX_UPLOAD_IMAGE_BYTES);
    expect(MAX_UPLOAD_IMAGE_BYTES).toBeLessThan(MAX_SOURCE_IMAGE_BYTES);
  });

  it('una imagen de 1 MB se sube tal cual, sin recomprimir', async () => {
    const file = makeFile('foto.jpg', 1 * MB, 'image/jpeg');
    const bitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', bitmap);

    const out = await normalizeImageForUpload(file);

    expect(out).toBe(file); // mismo File: no se tocó
    expect(bitmap).not.toHaveBeenCalled();
  });

  it('dos imágenes de 3 MB se normalizan de forma independiente (6 MB en total)', async () => {
    stubCanvas([600 * 1024]);

    const a = await normalizeImageForUpload(makeFile('a.jpg', 3 * MB, 'image/jpeg'));
    const b = await normalizeImageForUpload(makeFile('b.jpg', 3 * MB, 'image/jpeg'));

    // Ninguna de las dos falla, aunque juntas superen 5 MB: el límite es por
    // archivo. Éste es exactamente el síntoma reportado por el operador.
    expect(a.size).toBeLessThan(CLIENT_IMAGE_TARGET_BYTES);
    expect(b.size).toBeLessThan(CLIENT_IMAGE_TARGET_BYTES);
    expect(a.size + b.size).toBeLessThan(6 * MB);
  });

  it('una foto de cámara de 8 MB se comprime en lugar de rechazarse', async () => {
    const drawn = stubCanvas([1200 * 1024]);

    const out = await normalizeImageForUpload(makeFile('IMG_0042.JPG', 8 * MB, 'image/jpeg'));

    expect(out.size).toBeLessThanOrEqual(CLIENT_IMAGE_TARGET_BYTES);
    expect(out.type).toBe('image/jpeg');
    // Se reescala al lado mayor configurado (2000 px sobre un 4032×3024).
    expect(drawn[0].width).toBe(2000);
    expect(drawn[0].height).toBe(1500);
  });

  it('si un paso no basta, reintenta con menos resolución y calidad', async () => {
    // Cada intento reduce poco: hacen falta tres para bajar del objetivo.
    const drawn = stubCanvas([9 * MB, 7 * MB, 4 * MB]);

    const out = await normalizeImageForUpload(makeFile('enorme.jpg', 18 * MB, 'image/jpeg'));

    expect(drawn).toHaveLength(3);
    expect(drawn[0].width).toBeGreaterThan(drawn[2].width);
    expect(drawn[0].quality).toBeGreaterThan(drawn[2].quality);
    expect(out.size).toBeLessThanOrEqual(CLIENT_IMAGE_TARGET_BYTES);
  });

  it('una imagen cerca del límite de origen (20 MB) todavía se acepta', async () => {
    stubCanvas([1 * MB]);
    await expect(
      normalizeImageForUpload(makeFile('casi.jpg', MAX_SOURCE_IMAGE_BYTES - 1, 'image/jpeg')),
    ).resolves.toBeTruthy();
  });

  it('rechaza SÓLO ese archivo si el origen supera el máximo', async () => {
    const file = makeFile('gigante.jpg', MAX_SOURCE_IMAGE_BYTES + 1, 'image/jpeg');
    await expect(normalizeImageForUpload(file)).rejects.toBeInstanceOf(NormalizeImageError);
    await expect(normalizeImageForUpload(file)).rejects.toMatchObject({
      code: 'source-too-large',
    });
  });

  it('informa cuando ni comprimiendo se baja del objetivo', async () => {
    stubCanvas([6 * MB]); // ningún intento consigue bajar de 5 MB
    await expect(
      normalizeImageForUpload(makeFile('incompresible.jpg', 19 * MB, 'image/jpeg')),
    ).rejects.toMatchObject({ code: 'still-too-large' });
  });
});

describe('formatos', () => {
  it.each([
    ['image/jpeg', 'foto.jpg'],
    ['image/png', 'captura.png'],
    ['image/webp', 'render.webp'],
  ])('%s pequeño pasa sin modificar', async (type, name) => {
    const file = makeFile(name, 800 * 1024, type);
    await expect(normalizeImageForUpload(file)).resolves.toBe(file);
  });

  it('detecta GIF por MIME y por extensión', () => {
    expect(isGifFile(makeFile('anim.gif', 10, 'image/gif'))).toBe(true);
    expect(isGifFile(makeFile('anim.GIF', 10, ''))).toBe(true);
    expect(isGifFile(makeFile('foto.jpg', 10, 'image/jpeg'))).toBe(false);
  });

  it('NO convierte un GIF animado grande a JPEG (perdería la animación)', async () => {
    const gif = makeFile('promo.gif', 7 * MB, 'image/gif');
    const bitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', bitmap);

    const out = await normalizeImageForUpload(gif);

    expect(out).toBe(gif);
    expect(out.type).toBe('image/gif');
    expect(bitmap).not.toHaveBeenCalled();
    // Y cabe dentro del límite del servidor, que por eso tiene margen.
    expect(out.size).toBeLessThan(MAX_UPLOAD_IMAGE_BYTES);
  });
});

describe('HEIC / HEIF de iPhone', () => {
  it('detecta HEIC por MIME y por extensión (Safari a veces no informa type)', () => {
    expect(isHeicFile(makeFile('IMG_1.heic', 10, 'image/heic'))).toBe(true);
    expect(isHeicFile(makeFile('IMG_2.HEIF', 10, ''))).toBe(true);
    expect(isHeicFile(makeFile('IMG_3.jpg', 10, 'image/jpeg'))).toBe(false);
  });

  it('convierte HEIC a JPEG antes de subir (seam E2E)', async () => {
    const decoder = vi.fn(async () => new Blob([new Uint8Array(900 * 1024)], { type: 'image/jpeg' }));
    (window as unknown as { __E2E_HEIC_DECODER__?: unknown }).__E2E_HEIC_DECODER__ = decoder;

    try {
      const out = await normalizeImageForUpload(makeFile('IMG_0001.HEIC', 4 * MB, 'image/heic'));
      expect(decoder).toHaveBeenCalledTimes(1);
      expect(out.type).toBe('image/jpeg');
      expect(out.name).toBe('IMG_0001.jpg');
    } finally {
      delete (window as unknown as { __E2E_HEIC_DECODER__?: unknown }).__E2E_HEIC_DECODER__;
    }
  });

  it('un HEIC grande se convierte Y se comprime', async () => {
    const decoder = vi.fn(async () => new Blob([new Uint8Array(9 * MB)], { type: 'image/jpeg' }));
    (window as unknown as { __E2E_HEIC_DECODER__?: unknown }).__E2E_HEIC_DECODER__ = decoder;
    stubCanvas([900 * 1024]);

    try {
      const out = await normalizeImageForUpload(makeFile('IMG_0002.HEIC', 9 * MB, 'image/heic'));
      expect(out.type).toBe('image/jpeg');
      expect(out.size).toBeLessThanOrEqual(CLIENT_IMAGE_TARGET_BYTES);
    } finally {
      delete (window as unknown as { __E2E_HEIC_DECODER__?: unknown }).__E2E_HEIC_DECODER__;
    }
  });
});
