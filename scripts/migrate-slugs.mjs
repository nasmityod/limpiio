import { PrismaClient } from '@prisma/client';
import { PrismaPg }    from '@prisma/adapter-pg';
import { Pool }        from 'pg';
import { config }      from 'dotenv';

// Cargar variables de entorno desde .env
config();

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  const products = await prisma.product.findMany({
    where:  { slug: null },
    select: { id: true, name: true },
  });

  console.log(`Productos sin slug: ${products.length}`);
  if (products.length === 0) {
    console.log('Nada que migrar. Todos los productos ya tienen slug.');
    return;
  }

  const existing = await prisma.product.findMany({
    where:  { slug: { not: null } },
    select: { slug: true },
  });
  const existingSlugs = new Set(existing.map(p => p.slug));

  let updated = 0;
  for (const p of products) {
    let base      = slugify(p.name) || `producto-${p.id.slice(-6)}`;
    let candidate = base;
    let counter   = 2;
    while (existingSlugs.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter++;
    }
    existingSlugs.add(candidate);
    await prisma.product.update({ where: { id: p.id }, data: { slug: candidate } });
    console.log(`  ✓  "${p.name}"  →  "${candidate}"`);
    updated++;
  }

  console.log(`\n✅ Slugs generados exitosamente: ${updated} productos.`);
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
