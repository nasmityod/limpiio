/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * RC-06 de la auditoría de rendimiento del Panel Admin — selección múltiple.
 *
 * El bucle anterior de `AddProductModal` subía el File original sin normalizar
 * y hacía `alert` + `break` al primer fallo, cancelando el resto de la
 * selección. Estas pruebas fijan el comportamiento nuevo:
 *   · cada archivo es independiente (dos de 3 MB = 6 MB en total: válido)
 *   · un fallo no borra ni cancela las imágenes que sí subieron
 *   · la concurrencia está acotada
 *   · el orden de la galería es el de selección, no el de finalización
 */

const normalizeMock = vi.fn();
vi.mock('@/lib/client-image-normalize', () => ({
  normalizeImageForUpload: (...args: unknown[]) => normalizeMock(...args),
}));

const {
  UPLOAD_CONCURRENCY,
  completedUrlsInOrder,
  uploadProductImages,
} = await import('@/lib/products/upload-product-images');

const MB = 1024 * 1024;

function makeFile(name: string, sizeBytes: number, type = 'image/jpeg'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
  return file;
}

interface FetchPlan {
  /** Respuesta por nombre de archivo. */
  [fileName: string]:
    | { ok: true; url: string; delayMs?: number }
    | { ok: false; status: number; error: string; delayMs?: number };
}

let inFlight = 0;
let maxInFlight = 0;

function stubFetch(plan: FetchPlan) {
  inFlight = 0;
  maxInFlight = 0;
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const fd = init.body as FormData;
    const file = fd.get('file') as File;
    const entry = plan[file.name] ?? { ok: true, url: `https://cdn.test/${file.name}` };
    if (entry.delayMs) await new Promise(r => setTimeout(r, entry.delayMs));
    inFlight--;
    if (entry.ok) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ url: entry.url }),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: entry.status,
      json: async () => ({ error: entry.error }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  normalizeMock.mockReset();
  // Por defecto la normalización devuelve un archivo ya optimizado.
  normalizeMock.mockImplementation(async (file: File) => makeFile(file.name, 400 * 1024));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selección múltiple: los límites son por archivo', () => {
  it('dos imágenes de 3 MB (6 MB en total) se suben ambas', async () => {
    stubFetch({});
    const result = await uploadProductImages({
      files: [makeFile('foto1.jpg', 3 * MB), makeFile('foto2.jpg', 3 * MB)],
    });

    expect(result.urls).toEqual([
      'https://cdn.test/foto1.jpg',
      'https://cdn.test/foto2.jpg',
    ]);
    expect(result.failed).toHaveLength(0);
  });

  it('seis imágenes que suman 18 MB se suben todas', async () => {
    stubFetch({});
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.jpg`, 3 * MB));
    const result = await uploadProductImages({ files });

    expect(result.urls).toHaveLength(6);
    expect(result.failed).toHaveLength(0);
  });

  it('cada archivo viaja en su propia petición (no un lote único)', async () => {
    const fetchMock = stubFetch({});
    await uploadProductImages({
      files: [makeFile('a.jpg', 1 * MB), makeFile('b.jpg', 1 * MB), makeFile('c.jpg', 1 * MB)],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      const fd = (call[1] as RequestInit).body as FormData;
      expect(fd.getAll('file')).toHaveLength(1);
    }
  });

  it('normaliza cada archivo antes de subirlo', async () => {
    stubFetch({});
    await uploadProductImages({ files: [makeFile('a.jpg', 8 * MB), makeFile('b.heic', 9 * MB)] });
    expect(normalizeMock).toHaveBeenCalledTimes(2);
  });
});

describe('aislamiento de fallos', () => {
  it('un 413 en una imagen NO cancela las demás', async () => {
    stubFetch({
      'mala.jpg': { ok: false, status: 413, error: 'Esta imagen supera el tamaño máximo por archivo.' },
    });

    const result = await uploadProductImages({
      files: [makeFile('buena1.jpg', 2 * MB), makeFile('mala.jpg', 12 * MB), makeFile('buena2.jpg', 2 * MB)],
    });

    expect(result.urls).toEqual([
      'https://cdn.test/buena1.jpg',
      'https://cdn.test/buena2.jpg',
    ]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe('mala.jpg');
    expect(result.failed[0].error).toContain('por archivo');
  });

  it('un fallo de normalización (origen demasiado grande) sólo afecta a ese archivo', async () => {
    stubFetch({});
    normalizeMock.mockImplementation(async (file: File) => {
      if (file.name === 'gigante.jpg') throw new Error('La imagen de origen supera el máximo permitido.');
      return makeFile(file.name, 400 * 1024);
    });

    const result = await uploadProductImages({
      files: [makeFile('ok.jpg', 1 * MB), makeFile('gigante.jpg', 30 * MB)],
    });

    expect(result.urls).toEqual(['https://cdn.test/ok.jpg']);
    expect(result.failed.map(f => f.name)).toEqual(['gigante.jpg']);
  });

  it('una respuesta no-JSON (413 de un proxy) produce un error legible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 413,
      json: async () => { throw new Error('no json'); },
    }) as unknown as Response));

    const result = await uploadProductImages({ files: [makeFile('a.jpg', 1 * MB)] });
    expect(result.failed[0].error).toContain('413');
  });

  it('informa el estado de cada archivo por separado', async () => {
    stubFetch({ 'mala.jpg': { ok: false, status: 415, error: 'Tipo no permitido.' } });
    const snapshots: string[][] = [];

    const result = await uploadProductImages({
      files: [makeFile('buena.jpg', 1 * MB), makeFile('mala.jpg', 1 * MB)],
      onProgress: items => snapshots.push(items.map(i => i.status)),
    });

    expect(result.items.map(i => i.status)).toEqual(['done', 'error']);
    // Hubo estados intermedios visibles antes del resultado final.
    expect(snapshots.some(s => s.includes('processing') || s.includes('uploading'))).toBe(true);
    expect(snapshots[0]).toEqual(['pending', 'pending']);
  });
});

describe('concurrencia y orden', () => {
  it('nunca hay más de UPLOAD_CONCURRENCY peticiones en vuelo', async () => {
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`f${i}.jpg`, 1 * MB));
    const plan: FetchPlan = {};
    for (const f of files) plan[f.name] = { ok: true, url: `https://cdn.test/${f.name}`, delayMs: 20 };
    stubFetch(plan);

    await uploadProductImages({ files, concurrency: UPLOAD_CONCURRENCY });

    expect(UPLOAD_CONCURRENCY).toBeGreaterThanOrEqual(2);
    expect(UPLOAD_CONCURRENCY).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeLessThanOrEqual(UPLOAD_CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1); // y no es secuencial
  });

  it('el orden final es el de selección aunque terminen desordenadas', async () => {
    stubFetch({
      'primera.jpg': { ok: true, url: 'https://cdn.test/primera.jpg', delayMs: 40 },
      'segunda.jpg': { ok: true, url: 'https://cdn.test/segunda.jpg', delayMs: 1 },
      'tercera.jpg': { ok: true, url: 'https://cdn.test/tercera.jpg', delayMs: 1 },
    });

    const result = await uploadProductImages({
      files: [makeFile('primera.jpg', 1 * MB), makeFile('segunda.jpg', 1 * MB), makeFile('tercera.jpg', 1 * MB)],
    });

    expect(result.urls).toEqual([
      'https://cdn.test/primera.jpg',
      'https://cdn.test/segunda.jpg',
      'https://cdn.test/tercera.jpg',
    ]);
  });

  it('completedUrlsInOrder respeta el índice de selección', () => {
    const urls = completedUrlsInOrder([
      { index: 2, name: 'c', status: 'done', url: 'c.webp' },
      { index: 0, name: 'a', status: 'done', url: 'a.webp' },
      { index: 1, name: 'b', status: 'error', error: 'x' },
    ]);
    expect(urls).toEqual(['a.webp', 'c.webp']);
  });

  it('con un solo archivo no se abren varios workers', async () => {
    stubFetch({ 'solo.jpg': { ok: true, url: 'https://cdn.test/solo.jpg', delayMs: 10 } });
    await uploadProductImages({ files: [makeFile('solo.jpg', 1 * MB)] });
    expect(maxInFlight).toBe(1);
  });
});
