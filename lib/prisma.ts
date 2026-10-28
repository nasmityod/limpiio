import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { normalizePostgresUrlForNodePg } from '@/lib/normalize-postgres-url-for-node-pg';
import '@/lib/env-validation';
import { databasePoolConfig } from '@/lib/database-pool-config';
import { logError } from '@/lib/safe-logger';

declare global {
  // allow global `var` declarations
  var prismaRuntime: { client: PrismaClient; pool: Pool } | undefined;
}

function createRuntime() {
  const pool = new Pool({
    connectionString: normalizePostgresUrlForNodePg(process.env.DATABASE_URL),
    ...databasePoolConfig(),
  });
  // pg emits idle-client errors outside query promises; without a listener they
  // can terminate the process during a PostgreSQL restart.
  pool.on('error', () => logError('database_idle_connection_error', new Error('PostgreSQL idle connection failed')));
  return { client: new PrismaClient({ adapter: new PrismaPg(pool) }), pool };
}

const runtime = global.prismaRuntime ??= createRuntime();
export const prisma = runtime.client;
