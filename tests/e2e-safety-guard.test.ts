/**
 * Guardas de seguridad de E2E. Son dos capas independientes y ambas deben
 * seguir en pie:
 *  - host  (lib/e2e-host-guard.ts, usada por playwright.config.ts)
 *  - base de datos (lib/e2e-db-guard.ts, usada por scripts/e2e-reset-db.ts)
 *
 * La invariante que cubre este archivo es que la guarda de host es FAIL-SAFE:
 * sin configuración aborta. El escenario en que alguien olvida declarar su
 * host de producción es exactamente el escenario en que se lanzan los E2E
 * contra producción, y los E2E truncan tablas.
 */
import { describe, expect, it } from 'vitest';
import {
  assertE2eBaseUrl,
  validateE2eBaseUrl,
  type E2eHostGuardResult,
} from '@/lib/e2e-host-guard';
import { validateE2eDatabaseUrl } from '@/lib/e2e-db-guard';

const PROD = 'https://mi-dominio.com';

/** Motivo del rechazo, o cadena vacía si el guard permitió la URL. */
function reasonOf(result: E2eHostGuardResult): string {
  return result.ok ? '' : result.reason;
}

describe('guarda de host E2E', () => {
  describe('1. E2E_FORBIDDEN_HOST declarado', () => {
    it('aborta si la URL base contiene el host prohibido', () => {
      const result = validateE2eBaseUrl({
        baseUrl: 'https://mi-dominio.com',
        forbiddenHost: 'mi-dominio.com',
      });
      expect(result.ok).toBe(false);
      expect(reasonOf(result)).toContain('[E2E SAFETY]');
      expect(reasonOf(result)).toContain('E2E_FORBIDDEN_HOST');
    });

    it('aborta también en subdominios y con mayúsculas', () => {
      expect(
        validateE2eBaseUrl({
          baseUrl: 'https://WWW.MI-DOMINIO.COM/checkout',
          forbiddenHost: 'mi-dominio.com',
        }).ok,
      ).toBe(false);
      expect(
        validateE2eBaseUrl({
          baseUrl: 'https://www.mi-dominio.com',
          forbiddenHost: '  MI-DOMINIO.COM  ',
        }).ok,
      ).toBe(false);
    });

    it('permite un host remoto de staging que no coincide', () => {
      expect(
        validateE2eBaseUrl({
          baseUrl: 'https://staging.mi-dominio.test',
          forbiddenHost: 'mi-dominio.com',
        }).ok,
      ).toBe(true);
    });

    it('el host explícito manda sobre NEXT_PUBLIC_SITE_URL', () => {
      // SITE_URL apunta a otro sitio: si mandara el derivado, esto pasaría.
      expect(
        validateE2eBaseUrl({
          baseUrl: 'https://mi-dominio.com',
          forbiddenHost: 'mi-dominio.com',
          siteUrl: 'https://otra-tienda.com',
        }).ok,
      ).toBe(false);
    });
  });

  describe('2. host derivado de NEXT_PUBLIC_SITE_URL', () => {
    it('aborta si la URL base contiene el host de SITE_URL', () => {
      const result = validateE2eBaseUrl({ baseUrl: PROD, siteUrl: PROD });
      expect(result.ok).toBe(false);
      expect(reasonOf(result)).toContain('[E2E SAFETY]');
      expect(reasonOf(result)).toContain('NEXT_PUBLIC_SITE_URL');
    });

    it('aborta aunque SITE_URL traiga ruta, puerto o barra final', () => {
      expect(
        validateE2eBaseUrl({
          baseUrl: 'https://mi-dominio.com/producto/x',
          siteUrl: 'https://mi-dominio.com/',
        }).ok,
      ).toBe(false);
    });

    it('aborta en subdominios del host derivado', () => {
      expect(
        validateE2eBaseUrl({ baseUrl: 'https://www.mi-dominio.com', siteUrl: PROD }).ok,
      ).toBe(false);
    });

    it('permite una URL base local aunque SITE_URL sea producción', () => {
      expect(
        validateE2eBaseUrl({ baseUrl: 'http://localhost:34567', siteUrl: PROD }).ok,
      ).toBe(true);
    });

    it('permite staging remoto distinto del host derivado', () => {
      expect(
        validateE2eBaseUrl({ baseUrl: 'https://staging.example.test', siteUrl: PROD }).ok,
      ).toBe(true);
    });
  });

  describe('3. sin ninguna variable declarada', () => {
    it('aborta si la URL base es remota (fail-safe, no fail-open)', () => {
      const result = validateE2eBaseUrl({ baseUrl: 'https://mi-dominio.com' });
      expect(result.ok).toBe(false);
      expect(reasonOf(result)).toContain('[E2E SAFETY]');
      // El mensaje debe explicar cómo resolverlo, no solo que falló.
      expect(reasonOf(result)).toContain('E2E_FORBIDDEN_HOST');
    });

    it('aborta también con SITE_URL vacía o ausente', () => {
      expect(validateE2eBaseUrl({ baseUrl: 'https://x.test', siteUrl: '' }).ok).toBe(false);
      expect(
        validateE2eBaseUrl({ baseUrl: 'https://x.test', forbiddenHost: '   ' }).ok,
      ).toBe(false);
    });

    it('aborta si la URL base no es una URL válida', () => {
      expect(validateE2eBaseUrl({ baseUrl: 'no-es-una-url' }).ok).toBe(false);
    });

    it('aborta si la URL base está vacía', () => {
      const result = validateE2eBaseUrl({ baseUrl: '   ' });
      expect(result.ok).toBe(false);
      expect(reasonOf(result)).toContain('[E2E SAFETY]');
    });
  });

  describe('4. URL base local sin variables → permitido', () => {
    it.each([
      'http://localhost:34567',
      'http://127.0.0.1:34567',
      'http://0.0.0.0:34567',
      'http://[::1]:34567',
      'http://localhost:3000',
    ])('permite %s', (baseUrl) => {
      expect(validateE2eBaseUrl({ baseUrl }).ok).toBe(true);
    });

    it('no toma localhost por producción cuando SITE_URL es la de desarrollo', () => {
      // Escenario exacto de ci.yml (job e2e y job axe): PLAYWRIGHT_BASE_URL y
      // NEXT_PUBLIC_SITE_URL valen http://localhost:3000 y no hay
      // E2E_FORBIDDEN_HOST. Si el host derivado no excluyera los locales, la
      // guarda abortaría toda ejecución legítima de CI.
      expect(
        validateE2eBaseUrl({
          baseUrl: 'http://localhost:3000',
          siteUrl: 'http://localhost:3000',
        }).ok,
      ).toBe(true);
    });

    it('sigue abortando con URL base remota si SITE_URL es local', () => {
      expect(
        validateE2eBaseUrl({
          baseUrl: 'https://mi-dominio.com',
          siteUrl: 'http://localhost:3000',
        }).ok,
      ).toBe(false);
    });
  });

  describe('assertE2eBaseUrl', () => {
    it('lanza con el prefijo [E2E SAFETY] cuando el guard falla', () => {
      expect(() => assertE2eBaseUrl({ baseUrl: 'https://mi-dominio.com' })).toThrow(
        /^\[E2E SAFETY\]/,
      );
    });

    it('no lanza en el caso local legítimo', () => {
      expect(() => assertE2eBaseUrl({ baseUrl: 'http://localhost:34567' })).not.toThrow();
    });
  });
});

describe('guarda de BD E2E (capa independiente)', () => {
  it('sigue exigiendo "_e2e" o "test" en la BD', () => {
    expect(validateE2eDatabaseUrl('postgresql://ci:ci@localhost:5432/app_e2e').ok).toBe(true);
    expect(validateE2eDatabaseUrl('postgresql://ci:ci@localhost:5432/test').ok).toBe(true);
    expect(validateE2eDatabaseUrl('postgresql://u:p@localhost:5432/tienda').ok).toBe(false);
    expect(validateE2eDatabaseUrl('').ok).toBe(false);
  });
});
