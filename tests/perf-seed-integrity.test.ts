import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn(), dbName: 'fixture_perf_test' }));
vi.mock('dotenv/config', () => ({}));
vi.mock('pg', () => ({ default: { Client: class { connect = m.connect; query = m.query; end = m.end; } } }));
const originalArgs = [...process.argv];

async function runSeed(args = ['--products', '2', '--orders', '3', '--reviews', '1']) {
  process.argv = ['node', 'scripts/perf-seed.mjs', ...args];
  vi.resetModules();
  await import('@/scripts/perf-seed.mjs');
}
beforeEach(() => {
  vi.clearAllMocks(); m.dbName = 'fixture_perf_test';
  vi.stubEnv('PERF_DATABASE_URL', 'postgresql://fixture:fixture@127.0.0.1:1/fixture_perf_test');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('fixture rejected'); });
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  m.connect.mockResolvedValue(undefined); m.end.mockResolvedValue(undefined);
  m.query.mockImplementation(async (sql: string) => sql.startsWith('SELECT current_database') ? { rows: [{ name: m.dbName }] } : { rows: [], rowCount: 0 });
});
afterEach(() => { process.argv = [...originalArgs]; vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Dedicated performance seed consistency', () => {
  it('clears independent durable metadata and commits the complete fixture', async () => {
    await runSeed();
    const statements = m.query.mock.calls.map(([sql]) => sql as string);
    const truncate = statements.find((sql) => sql.startsWith('TRUNCATE'))!;
    for (const model of ['EmailDelivery', 'CheckoutAttempt', 'CartReminderPreference', 'ReviewPhotoUpload', 'PaymentUpload', 'VideoJob', 'RestockSubscription']) expect(truncate).toContain(`"${model}"`);
    expect(statements.indexOf('BEGIN')).toBeLessThan(statements.indexOf(truncate));
    expect(statements.at(-2)).toBe('COMMIT'); expect(statements.at(-1)).toBe('ANALYZE'); expect(m.end).toHaveBeenCalledTimes(1);
  });
  it('makes paid revenue explicit and keeps stored order totals equal to the sum of their lines in either currency', async () => {
    await runSeed();
    const orderParams = m.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO "Order"'))![1] as unknown[];
    const itemParams = m.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO "OrderItem"'))![1] as unknown[];
    const lineTotals = new Map<string, number>();
    for (let i = 0; i < itemParams.length; i += 6) {
      const orderId = itemParams[i + 1] as string;
      lineTotals.set(orderId, (lineTotals.get(orderId) ?? 0) + Math.round(Number(itemParams[i + 4]) * 100) * Number(itemParams[i + 5]));
    }
    for (let i = 0; i < orderParams.length; i += 18) {
      expect(orderParams[i + 5]).toBe('Enviado'); expect(orderParams[i + 14]).toEqual(orderParams[i + 8]);
      expect(Math.round(Number(orderParams[i + 6]) * 100)).toBe(lineTotals.get(orderParams[i] as string));
    }
    expect(orderParams[7]).toBeNull(); expect(orderParams[25]).not.toBeNull();
  });
  it('does not mark cancelled fixtures paid or reserved', async () => {
    vi.mocked(Math.random).mockReturnValue(0.9);
    await runSeed(['--products', '1', '--orders', '1', '--reviews', '0']);
    const params = m.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO "Order"'))![1] as unknown[];
    expect(params[5]).toBe('Cancelado'); expect(params[14]).toBeNull(); expect(params[17]).toBe(false);
  });
  it('advances the order number sequence to the seeded maximum before commit, with empty-table handling', async () => {
    await runSeed();
    const statements = m.query.mock.calls.map(([sql]) => sql as string);
    const sequence = statements.find((sql) => sql.startsWith('SELECT setval'))!;
    expect(sequence).toContain('MAX("orderNumber")'); expect(sequence).toContain('COALESCE');
    expect(sequence).toContain('MAX("orderNumber") IS NOT NULL');
    expect(statements.indexOf(sequence)).toBeLessThan(statements.indexOf('COMMIT'));
  });
  it('rejects a mismatched connected database before any destructive query', async () => {
    m.dbName = 'production';
    await expect(runSeed()).rejects.toThrow('no coincide');
    expect(m.query.mock.calls.some(([sql]) => sql.startsWith('TRUNCATE'))).toBe(false); expect(m.end).toHaveBeenCalledTimes(1);
  });
  it('rolls back a failed fixture instead of leaving a partially reseeded database', async () => {
    m.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO "Product"')) throw new Error('mock insert failed');
      return sql.startsWith('SELECT current_database') ? { rows: [{ name: m.dbName }] } : { rows: [] };
    });
    await expect(runSeed()).rejects.toThrow('mock insert failed');
    expect(m.query).toHaveBeenCalledWith('ROLLBACK'); expect(m.query).not.toHaveBeenCalledWith('COMMIT'); expect(m.end).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['--products', '0'], ['--products', 'Infinity'], ['--products', '100001'], ['--products', '1.5'],
    ['--orders', '-1'], ['--orders', '500001'], ['--reviews', '250001'], ['--products', '1', '--products', '2'], ['--unknown', '2'],
  ])('rejects malformed or excessive counts before connecting: %j', async (...args) => {
    await expect(runSeed(args)).rejects.toThrow(); expect(m.connect).not.toHaveBeenCalled();
  });
  it('rejects a database name without the fixture marker and never falls back to DATABASE_URL', async () => {
    vi.stubEnv('PERF_DATABASE_URL', 'postgresql://fixture:fixture@127.0.0.1:1/production');
    await expect(runSeed()).rejects.toThrow('fixture rejected'); expect(m.connect).not.toHaveBeenCalled();
    vi.stubEnv('PERF_DATABASE_URL', '');
    await expect(runSeed()).rejects.toThrow('fixture rejected'); expect(m.connect).not.toHaveBeenCalled();
  });
});
