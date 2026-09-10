/**
 * lib/e2e-axe.ts
 *
 * Helper para escaneo Axe en pruebas E2E Playwright.
 * Devuelve detalles regla/impact/targets sin incluir HTML ni PII.
 */
import type { Page } from '@playwright/test';

export interface AxeViolationSummary {
  id: string;
  impact: string | null | undefined;
  description: string;
  help: string;
  helpUrl: string;
  targets: string[];
  tags: string[];
}

export interface AxeScanResult {
  violations: AxeViolationSummary[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  /** Tiempo del escaneo en ms */
  scanTimeMs: number;
}

/**
 * Escanea la página actual con axe-core y devuelve un resumen
 * sin incluir HTML (evita PII en reports).
 *
 * @param page     - Playwright Page
 * @param context  - Descripción del contexto (ruta + estado) para logging
 * @returns        - AxeScanResult con violations resumidas
 */
export async function scanAxe(page: Page, context: string): Promise<AxeScanResult> {
  const start = Date.now();

  // Inyectar y ejecutar axe-core
  // @axe-core/playwright exporta un helper `AxeBuilder`
  const { default: AxeBuilder } = await import('@axe-core/playwright');

  const builder = new AxeBuilder({ page })
    // No incluir HTML completo de los nodos — evita PII
    .options({
      resultTypes: ['violations', 'incomplete', 'inapplicable', 'passes'],
    });

  const results = await builder.analyze();

  const scanTimeMs = Date.now() - start;

  // Resumir violations sin HTML
  const violations: AxeViolationSummary[] = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    targets: v.nodes.map((n) => n.target.join(' ')),
    tags: v.tags,
  }));

  // Log para el reporte
  if (violations.length > 0) {
    console.log(`[AXE] ${context}: ${violations.length} violation(s) encontradas`);
    for (const v of violations) {
      console.log(`  - ${v.id} (${v.impact}): ${v.help}`);
      console.log(`    targets: ${v.targets.slice(0, 3).join(', ')}${v.targets.length > 3 ? ` …(+${v.targets.length - 3})` : ''}`);
    }
  } else {
    console.log(`[AXE] ${context}: 0 violations — OK`);
  }

  return {
    violations,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
    scanTimeMs,
  };
}

/**
 * Excepciones de reglas conocidas y documentadas.
 * Cada excepción debe tener una fecha de expiración.
 *
 * Formato: { ruleId: { selectors: string[], reason: string, expires: string } }
 * - ruleId: ID de la regla axe (ej. "color-contrast")
 * - selectors: selectores específicos donde se permite la violación (vacío = global para esa regla)
 * - reason: por qué se permite temporalmente
 * - expires: fecha ISO (YYYY-MM-DD) hasta la cual está permitido
 */
export const AXE_EXCEPTIONS: Record<string, { selectors: string[]; reason: string; expires: string }[]> = {
  // Ejemplo (no hay excepciones activas actualmente):
  // 'color-contrast': [
  //   { selectors: ['.promo-badge'], reason: 'Color corporativo aprobado por diseño, no cumple 4.5:1', expires: '2026-08-01' },
  // ],
};

/**
 * Filtra violations según las excepciones configuradas.
 * Retorna solo las violations que NO están en la lista de excepciones.
 */
export function filterExceptions(violations: AxeViolationSummary[]): AxeViolationSummary[] {
  const now = new Date();
  return violations.filter((v) => {
    const exceptions = AXE_EXCEPTIONS[v.id];
    if (!exceptions) return true;

    // Si no hay selectors específicos, la excepción es global
    const matchingException = exceptions.find((exc) => {
      if (exc.selectors.length === 0) return true;
      return v.targets.some((t) => exc.selectors.some((s) => t.includes(s)));
    });

    if (!matchingException) return true;

    // Si expiró, no aplicar excepción
    if (new Date(matchingException.expires) < now) return true;

    return false;
  });
}
