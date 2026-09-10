import { PrismaClient } from '@prisma/client';
import { PrismaPg }    from '@prisma/adapter-pg';
import { Pool }        from 'pg';
import { config }      from 'dotenv';

config();

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

const products = await prisma.product.findMany({
  select: { id: true, name: true, slug: true },
  orderBy: { createdAt: 'desc' },
});

console.log('\nProductos en BD:');
for (const p of products) {
  const slugStatus = p.slug ? `✓ slug: "${p.slug}"` : '⚠️  SIN SLUG (null)';
  console.log(`  id: ${p.id}`);
  console.log(`  nombre: ${p.name}`);
  console.log(`  ${slugStatus}`);
  console.log('');
}
console.log(`Total: ${products.length}`);

await prisma.$disconnect();
await pool.end();
