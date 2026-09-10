import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLIENT_IMAGE_TARGET_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_UPLOAD_IMAGE_BYTES,
} from '@/lib/upload-limits';

/**
 * RC-06 — POST /api/upload.
 *
 * El servidor sigue siendo la barrera real: magic bytes, permiso CATALOG,
 * comprobación de origen y rate limit se conservan. Lo único que cambia es que
 * el límite de tamaño es explícitamente POR ARCHIVO y con margen suficiente
 * para lo que el cliente no puede optimizar (GIF animado).
 */

const requirePermissionMock = vi.fn();
vi.mock('@/lib/admin-access-server', () => ({
  requirePermission: requirePermissionMock,
}));

const rejectInvalidMutationOriginMock = vi.fn();
vi.mock('@/lib/security', () => ({
  rejectInvalidMutationOrigin: rejectInvalidMutationOriginMock,
}));

const rateLimitMock = vi.fn();
vi.mock('@/lib/rate-limit', () => ({ rateLimit: rateLimitMock }));

const processImageMock = vi.fn();
vi.mock('@/lib/image-processing', () => ({ processImage: processImageMock }));

const uploadToR2Mock = vi.fn();
vi.mock('@/lib/r2', () => ({
  uploadToR2: uploadToR2Mock,
  buildKey: (folder: string, ext: string) => `${folder}/test.${ext}`,
}));

vi.mock('@/lib/safe-logger', () => ({
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

const { POST } = await import('@/app/api/upload/route');

const MB = 1024 * 1024;

/** Magic bytes reales de cada formato (el servidor no confía en file.type). */
const MAGIC = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  heic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
  /** Un ejecutable que se hace pasar por .jpg. */
  fake: [0x4d, 0x5a, 0x90, 0x00],
};

function makeFile(name: string, sizeBytes: number, magic: number[], type = 'image/jpeg'): File {
  const bytes = new Uint8Array(Math.max(sizeBytes, magic.length));
  bytes.set(magic, 0);
  return new File([bytes], name, { type });
}

function makeRequest(file: File, purpose = 'product'): Request {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('purpose', purpose);
  return new Request('https://mundotechve.com/api/upload', { method: 'POST', body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  rejectInvalidMutationOriginMock.mockReturnValue(null);
  requirePermissionMock.mockResolvedValue({
    authorized: true,
    session: { user: { id: 'admin-1' } },
  });
  rateLimitMock.mockResolvedValue(false);
  processImageMock.mockResolvedValue({
    buffer: Buffer.from([1]),
    contentType: 'image/webp',
    ext: 'webp',
    width: 1200,
    height: 900,
  });
  uploadToR2Mock.mockResolvedValue('https://cdn.test/products/test.webp');
});

describe('límites de tamaño del servidor', () => {
  it('la cadena de límites es coherente: cliente < servidor < origen', () => {
    expect(CLIENT_IMAGE_TARGET_BYTES).toBeLessThan(MAX_UPLOAD_IMAGE_BYTES);
    expect(MAX_UPLOAD_IMAGE_BYTES).toBeLessThan(MAX_SOURCE_IMAGE_BYTES);
  });

  it('acepta una imagen de 6 MB (antes se rechazaba con el tope de 5 MB)', async () => {
    const res = await POST(makeRequest(makeFile('grande.jpg', 6 * MB, MAGIC.jpeg)));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ url: expect.any(String) });
  });

  it('rechaza con 413 el archivo que supera el límite POR ARCHIVO', async () => {
    const res = await POST(makeRequest(makeFile('enorme.jpg', MAX_UPLOAD_IMAGE_BYTES + 1024, MAGIC.jpeg)));
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    // El mensaje aclara que el límite es por imagen, no por selección: era
    // justo la confusión que reportaba el operador.
    expect(body.error).toMatch(/por archivo/i);
    expect(body.error).toMatch(/por imagen, no por selección/i);
  });

  it('dos peticiones de 3 MB cada una tienen éxito (6 MB en total)', async () => {
    const a = await POST(makeRequest(makeFile('a.jpg', 3 * MB, MAGIC.jpeg)));
    const b = await POST(makeRequest(makeFile('b.jpg', 3 * MB, MAGIC.jpeg)));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('no existe ninguna comprobación de tamaño agregado en el código de la ruta', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/upload/route.ts'), 'utf8');
    // Un `sum(files.size)` o un getAll('file') delatarían un límite colectivo.
    expect(source).not.toMatch(/getAll\(\s*['"]file['"]\s*\)/);
    expect(source).not.toMatch(/reduce\([^)]*size/);
    expect(source).not.toMatch(/totalSize|sumSize|combinedSize/i);
  });
});

describe('validación por magic bytes (sin cambios)', () => {
  it.each([
    ['jpeg', MAGIC.jpeg],
    ['png', MAGIC.png],
    ['webp', MAGIC.webp],
    ['gif', MAGIC.gif],
  ])('acepta %s real', async (name, magic) => {
    const res = await POST(makeRequest(makeFile(`f.${name}`, 1024, magic)));
    expect(res.status).toBe(200);
  });

  it('rechaza un archivo que dice ser imagen pero no lo es', async () => {
    const res = await POST(makeRequest(makeFile('troyano.jpg', 2048, MAGIC.fake, 'image/jpeg')));
    expect(res.status).toBe(415);
    expect(uploadToR2Mock).not.toHaveBeenCalled();
  });

  it('rechaza HEIC crudo: debe convertirlo el cliente antes de subir', async () => {
    const res = await POST(makeRequest(makeFile('IMG_0001.HEIC', 2048, MAGIC.heic, 'image/heic')));
    expect(res.status).toBe(415);
  });
});

describe('protecciones que NO se relajan', () => {
  it('exige comprobación de origen', async () => {
    rejectInvalidMutationOriginMock.mockReturnValue(
      new Response('forbidden', { status: 403 }),
    );
    const res = await POST(makeRequest(makeFile('a.jpg', 1024, MAGIC.jpeg)));
    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('exige permiso CATALOG', async () => {
    requirePermissionMock.mockResolvedValue({
      authorized: false,
      response: new Response('unauthorized', { status: 401 }),
    });
    const res = await POST(makeRequest(makeFile('a.jpg', 1024, MAGIC.jpeg)));
    expect(res.status).toBe(401);
    expect(requirePermissionMock).toHaveBeenCalledWith('CATALOG');
  });

  it('mantiene el rate limit por admin', async () => {
    rateLimitMock.mockResolvedValue(true);
    const res = await POST(makeRequest(makeFile('a.jpg', 1024, MAGIC.jpeg)));
    expect(res.status).toBe(429);
  });

  it('rechaza un purpose fuera del enum', async () => {
    const res = await POST(makeRequest(makeFile('a.jpg', 1024, MAGIC.jpeg), '../../etc'));
    expect(res.status).toBe(400);
  });
});

describe('GIF animado', () => {
  it('se procesa con processImage, que conserva el GIF sin rasterizar', async () => {
    processImageMock.mockResolvedValue({
      buffer: Buffer.from([1]),
      contentType: 'image/gif',
      ext: 'gif',
      width: 480,
      height: 480,
    });
    const res = await POST(makeRequest(makeFile('anim.gif', 4 * MB, MAGIC.gif, 'image/gif')));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ mimeType: 'image/gif' });
  });

  it('lib/image-processing conserva los GIF (no los convierte a WebP)', () => {
    const source = readFileSync(join(process.cwd(), 'lib/image-processing.ts'), 'utf8');
    expect(source).toContain("detectedMime === 'image/gif'");
    expect(source).toContain('animated: true');
  });
});
