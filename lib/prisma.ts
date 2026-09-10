import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { normalizePostgresUrlForNodePg } from '@/lib/normalize-postgres-url-for-node-pg';
import '@/lib/env-validation';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const pool = new Pool({
  connectionString: normalizePostgresUrlForNodePg(process.env.DATABASE_URL),
});
const adapter = new PrismaPg(pool);

export const prisma =
  global.prisma ||
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
