/** Each Node process has its own pool. Account for all workers in PostgreSQL max_connections. */
function boundedEnvInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`[database] ${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

export function databasePoolConfig(databaseUrl = process.env.DATABASE_URL) {
  const statementMs = boundedEnvInteger('DATABASE_STATEMENT_TIMEOUT_MS', 30_000, 1_000, 300_000);
  let neonPooler = false;
  if (databaseUrl) {
    const { hostname } = new URL(databaseUrl);
    neonPooler = hostname.endsWith('.neon.tech') && hostname.split('.')[0].endsWith('-pooler');
  }
  return {
    max: boundedEnvInteger('DATABASE_POOL_MAX', 10, 1, 100),
    connectionTimeoutMillis: boundedEnvInteger('DATABASE_CONNECTION_TIMEOUT_MS', 5_000, 500, 60_000),
    idleTimeoutMillis: 30_000,
    maxLifetimeSeconds: 300,
    query_timeout: statementMs,
    // Neon PgBouncer rejects these startup parameters. For pooled connections,
    // configure server timeouts on the database role through DIRECT_URL.
    options: neonPooler ? undefined : `-c statement_timeout=${statementMs} -c lock_timeout=10000`,
  };
}
