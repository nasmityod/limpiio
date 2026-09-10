import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function normalizePostgresUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/^prisma\+/, '');
}

/** Cliente Prisma para scripts CLI (adapter pg + URL normalizada). */
export function createScriptPrisma(): PrismaClient {
  const pool = new Pool({
    connectionString: normalizePostgresUrl(process.env.DATABASE_URL),
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}
