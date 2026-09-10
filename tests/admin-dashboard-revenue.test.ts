import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VALIDATED_REVENUE_STATUSES,
  accumulateValidatedRevenue,
  type ValidatedRevenueRow,
} from '@/lib/analytics-orders';
import { roundMoney2 } from '@/lib/exchange-rate';

/**
 * RC-07 de la auditoría de rendimiento del Panel Admin.
 *
 * `getAdminDashboardData()` traía TODOS los pedidos validados con `findMany`
 * y sumaba en Node. Ahora agrega en PostgreSQL. Estas pruebas cubren las dos
 * mitades de la equivalencia:
 *
 *  1. `accumulateValidatedRevenue()` — la implementación de referencia, que es
 *     literalmente el bucle antiguo — sigue produciendo los valores esperados.
 *  2. La consulta SQL implementa EXACTAMENTE esas mismas reglas (mismos
 *     estados, redondeo por pedido, misma condición de «legado»).
 *
 * La comprobación numérica extremo a extremo contra una base real está en
 * `scripts/verify-dashboard-revenue.mts` (`npm run verify:dashboard-revenue`),
 * porque vitest en este repo corre sin base de datos.
 */

const DASHBOARD_SOURCE = readFileSync(
  join(process.cwd(), 'app/actions/adminDashboardActions.ts'),
  'utf8',
);

function rows(...items: [number, number | null][]): ValidatedRevenueRow[] {
  return items.map(([total, exchangeRateUsdBs]) => ({ total, exchangeRateUsdBs }));
}

describe('accumulateValidatedRevenue (implementación de referencia)', () => {
  it('sin pedidos devuelve ceros y sin legado', () => {
    expect(accumulateValidatedRevenue([])).toEqual({
      revenueUsd: 0,
      revenueBs: 0,
      hasLegacyUsdRevenue: false,
    });
  });

  it('pedido con tasa: USD = total/tasa redondeado, Bs = total', () => {
    const result = accumulateValidatedRevenue(rows([3650, 36.5]));
    expect(result.revenueUsd).toBe(100);
    expect(result.revenueBs).toBe(3650);
    expect(result.hasLegacyUsdRevenue).toBe(false);
  });

  it('pedido legado sin tasa: el total ya está en USD y no suma Bs', () => {
    const result = accumulateValidatedRevenue(rows([250, null]));
    expect(result.revenueUsd).toBe(250);
    expect(result.revenueBs).toBe(0);
    expect(result.hasLegacyUsdRevenue).toBe(true);
  });

  it('tasa 0 o negativa se trata como legado (nunca divide por cero)', () => {
    expect(accumulateValidatedRevenue(rows([100, 0]))).toEqual({
      revenueUsd: 100,
      revenueBs: 0,
      hasLegacyUsdRevenue: true,
    });
    expect(accumulateValidatedRevenue(rows([100, -5]))).toEqual({
      revenueUsd: 100,
      revenueBs: 0,
      hasLegacyUsdRevenue: true,
    });
  });

  it('mezcla legado + moderno', () => {
    const result = accumulateValidatedRevenue(rows([3650, 36.5], [7300, 36.5], [40, null]));
    expect(result.revenueUsd).toBe(340); // 100 + 200 + 40
    expect(result.revenueBs).toBe(10950);
    expect(result.hasLegacyUsdRevenue).toBe(true);
  });

  it('el redondeo es POR PEDIDO, no sólo al final', () => {
    // 10 / 3 = 3.3333… → 3.33 por pedido. Tres pedidos ⇒ 9.99, no 10.
    const result = accumulateValidatedRevenue(rows([10, 3], [10, 3], [10, 3]));
    expect(result.revenueUsd).toBe(9.99);
    expect(result.revenueUsd).not.toBe(roundMoney2(30 / 3));
  });
});

describe('la consulta SQL implementa las mismas reglas', () => {
  it('no queda ningún findMany de pedidos para sumar ingresos', () => {
    expect(DASHBOARD_SOURCE).not.toMatch(/order\.findMany\(\{[^}]*status:\s*\{\s*in:\s*\[\.\.\.VALIDATED/s);
    expect(DASHBOARD_SOURCE).toContain('fetchValidatedRevenueTotals');
  });

  it('filtra por los mismos estados validados', () => {
    expect(DASHBOARD_SOURCE).toContain('VALIDATED_REVENUE_STATUSES');
    expect(DASHBOARD_SOURCE).toContain('o.status IN (${VALIDATED_STATUS_LIST})');
    // Y la lista sigue siendo la única fuente de verdad.
    expect([...VALIDATED_REVENUE_STATUSES]).toEqual(['En Proceso', 'Enviado', 'Entregado']);
  });

  it('redondea la conversión a USD por pedido', () => {
    expect(DASHBOARD_SOURCE).toContain('ROUND(o."total" / o."exchangeRateUsdBs", 2)');
  });

  it('trata tasa nula o no positiva como pedido legado en USD', () => {
    expect(DASHBOARD_SOURCE).toContain(
      'WHEN o."exchangeRateUsdBs" IS NOT NULL AND o."exchangeRateUsdBs" > 0',
    );
    expect(DASHBOARD_SOURCE).toContain(
      'WHERE o."exchangeRateUsdBs" IS NULL OR o."exchangeRateUsdBs" <= 0',
    );
  });

  it('los ingresos en Bs excluyen el legado', () => {
    // La rama ELSE de la suma en Bs aporta 0 para los pedidos sin tasa: el
    // total legado está en USD y no tiene equivalente en Bs.
    const sqlStart = DASHBOARD_SOURCE.indexOf('AS revenue_usd');
    const bsBlock = DASHBOARD_SOURCE.slice(sqlStart, DASHBOARD_SOURCE.indexOf('AS revenue_bs'));
    expect(bsBlock).toContain('THEN o."total"');
    expect(bsBlock).toContain('ELSE 0');
  });

  it('el dashboard ya no hace findMany distinct para contar categorías', () => {
    // Ni una sola llamada viva a findMany con `distinct` (los comentarios que
    // documentan el código anterior no cuentan).
    const code = DASHBOARD_SOURCE.split('\n')
      .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toMatch(/findMany\(\{[^}]*distinct/s);
    expect(code).toContain('COUNT(DISTINCT category)');
  });
});
