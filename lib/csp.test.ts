import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPublicCachedCsp, buildStrictCsp } from '@/lib/csp';

/**
 * lib/csp.test.ts — Fase 9 ("Fase 9 — Seguridad/CSP y pruebas E2E" en
 * docs/MundoTech-Cashea-Orquestacion-Cursor.md).
 *
 * Objetivo: confirmar que la CSP NUNCA se relaja con dominios de Cashea
 * mientras `CASHEA_CSP_DOMAINS` siga vacía (Sección 12, preguntas 14-15 sin
 * responder) — ni con el flag apagado NI con el flag `NEXT_PUBLIC_CASHEA_ENABLED`
 * encendido. Esto es fail-closed a propósito: no inventar dominios.
 */

const ENV_KEY = 'NEXT_PUBLIC_CASHEA_ENABLED';
let original: string | undefined;

beforeEach(() => {
  original = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

describe('CSP — no se relaja con dominios de Cashea (placeholders sin confirmar)', () => {
  it('buildStrictCsp: flag off -> CSP idéntica a la baseline (sin ninguna mención a cashea)', () => {
    delete process.env[ENV_KEY];
    const csp = buildStrictCsp('test-nonce');
    expect(csp.toLowerCase()).not.toContain('cashea');
  });

  it('buildStrictCsp: flag on ("true") -> CASHEA_CSP_DOMAINS vacía, sin cambios en la CSP', () => {
    process.env[ENV_KEY] = 'true';
    const cspOff = (() => {
      delete process.env[ENV_KEY];
      return buildStrictCsp('test-nonce');
    })();
    process.env[ENV_KEY] = 'true';
    const cspOn = buildStrictCsp('test-nonce');

    expect(cspOn).toBe(cspOff);
    expect(cspOn.toLowerCase()).not.toContain('cashea');
  });

  it('buildPublicCachedCsp: flag on -> tampoco agrega nada de Cashea (placeholders vacíos)', () => {
    process.env[ENV_KEY] = 'true';
    const csp = buildPublicCachedCsp();
    expect(csp.toLowerCase()).not.toContain('cashea');
  });

  it('nunca contiene unsafe-eval ni relaja frame-ancestors/object-src, con o sin el flag', () => {
    for (const flag of [undefined, 'false', 'true']) {
      if (flag === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = flag;

      const strict = buildStrictCsp('n');
      const cached = buildPublicCachedCsp();
      for (const csp of [strict, cached]) {
        expect(csp).not.toContain('unsafe-eval');
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
      }
    }
  });
});
