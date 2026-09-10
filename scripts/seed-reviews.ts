/**
 * seed-reviews.ts
 * Siembra reseñas aprobadas con clientes venezolanos verosímiles para que la
 * tienda no luzca recién creada. Idempotente: no toca productos que ya tienen
 * reseñas y no duplica autores por producto.
 *
 * Uso:  npx tsx scripts/seed-reviews.ts
 *   (o) npx ts-node --transpile-only scripts/seed-reviews.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  // prisma+postgres:// → postgres:// para node-pg
  return raw.replace(/^prisma\+/, '');
}

// PRD-146: guard anti-producción. Las reseñas sembradas son contenido de
// demostración; ejecutarlas contra la BD de producción contaminaría datos
// reales. Para forzar conscientemente: SEED_REVIEWS_FORCE=1 npx tsx scripts/seed-reviews.ts
if (process.env.NODE_ENV === 'production' && process.env.SEED_REVIEWS_FORCE !== '1') {
  console.error(
    '[seed-reviews] Bloqueado: NODE_ENV=production. ' +
      'Si REALMENTE quieres sembrar reseñas demo en esta BD, ejecuta con SEED_REVIEWS_FORCE=1.',
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: normalizeUrl(process.env.DATABASE_URL) });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Nombres comunes en Lara/Venezuela — sin apellidos completos por privacidad. */
const AUTHORS = [
  'María Fernanda G.', 'José Gregorio P.', 'Andreína R.', 'Luis Alejandro M.',
  'Carmen Teresa S.', 'Yorman D.', 'Gabriela V.', 'Rafael Ángel T.',
  'Mariangel C.', 'Jhonny A.', 'Daniela P.', 'Carlos Eduardo L.',
  'Yusmary Q.', 'Miguel Ángel F.', 'Rosanny M.', 'Keiber J.',
  'Vanessa O.', 'Argenis B.', 'Niurka H.', 'Edgardo R.',
];

/** Plantillas con contexto real: retiro en tienda, delivery, pago móvil, tasa. */
const TEMPLATES: { rating: number; title: string; comment: string }[] = [
  {
    rating: 5,
    title: 'Llegó el mismo día',
    comment:
      'Lo pedí en la mañana y en la tarde ya lo tenía en casa, vivo cerca del centro de Barquisimeto. El producto tal cual la foto, sellado. Recomendados.',
  },
  {
    rating: 5,
    title: 'Atención de primera',
    comment:
      'Pregunté como tres veces por WhatsApp antes de decidirme y siempre me respondieron con paciencia. Pagué por pago móvil y verificaron rapidito.',
  },
  {
    rating: 4,
    title: 'Buena compra',
    comment:
      'El producto funciona perfecto. Le pongo 4 estrellas porque el envío por MRW tardó un día más de lo que esperaba, pero llegó bien embalado.',
  },
  {
    rating: 5,
    title: 'Tienda seria',
    comment:
      'Pasé primero por la tienda en Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001 a verlo en persona y después lo compré por la web para que me lo enviaran. Todo en orden, factura y garantía.',
  },
  {
    rating: 5,
    title: 'Tal cual lo describen',
    comment:
      'Estaba pendiente de la tasa y me respetaron el precio en bolívares del día que pagué. El equipo llegó nuevo y original.',
  },
  {
    rating: 4,
    title: 'Cumplieron',
    comment:
      'Era un regalo y necesitaba que llegara antes del fin de semana. Llegó justo a tiempo. El empaque podría ser más bonito para regalo, pero el producto excelente.',
  },
  {
    rating: 5,
    title: 'Mi segunda compra',
    comment:
      'Ya es la segunda vez que les compro. La primera fue en la tienda física y esta vez por la página. El mismo trato en los dos lados, eso se agradece.',
  },
  {
    rating: 5,
    title: 'Resolvieron mi duda de garantía',
    comment:
      'Tuve un detalle con el cargador y me lo cambiaron sin drama presentando el número de pedido. Así da gusto comprar en Barquisimeto.',
  },
  {
    rating: 4,
    title: 'Relación precio-calidad',
    comment:
      'Comparé en varias tiendas del centro y aquí estaba al mejor precio. El pago con Binance fue rápido, me confirmaron por correo a los minutos.',
  },
  {
    rating: 5,
    title: 'Excelente para el día a día',
    comment:
      'Lo uso todos los días desde hace semanas y cero problemas. La batería rinde y vino con todos sus accesorios. Volveré a comprar.',
  },
  {
    rating: 5,
    title: 'Rápido y confiable',
    comment:
      'Primera vez comprando online con una tienda de aquí de Lara y la experiencia fue mejor que con tiendas grandes. Tracking del envío y todo.',
  },
  {
    rating: 3,
    title: 'Bueno, con detalle',
    comment:
      'El producto está bien pero el color no era exactamente como en la foto. Me ofrecieron cambiarlo, al final me lo quedé. Buena disposición de la tienda.',
  },
];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, createdAt: true, _count: { select: { reviews: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (products.length === 0) {
    console.log('No hay productos en la BD — nada que reseñar.');
    return;
  }

  const targets = products.filter((p) => p._count.reviews === 0);
  console.log(`Productos sin reseñas: ${targets.length}/${products.length}`);

  let created = 0;
  let authorCursor = 0;
  let templateCursor = 0;

  for (const product of targets) {
    // 1–3 reseñas por producto, más para los primeros (más antiguos)
    const count = created < 8 ? 3 : created < 20 ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const tpl = pick(TEMPLATES, templateCursor++);
      const author = pick(AUTHORS, authorCursor++);

      // Fecha verosímil: entre la creación del producto y hoy
      const from = product.createdAt.getTime();
      const span = Math.max(Date.now() - from, 24 * 60 * 60 * 1000);
      const when = new Date(from + Math.random() * span);

      await prisma.review.create({
        data: {
          productId: product.id,
          authorName: author,
          rating: tpl.rating,
          title: tpl.title,
          comment: tpl.comment,
          status: 'APPROVED',
          verifiedPurchase: Math.random() > 0.45,
          createdAt: when,
          updatedAt: when,
        },
      });
      created++;
    }
  }

  console.log(`Listo: ${created} reseñas creadas.`);
}

main()
  .catch((e) => {
    console.error('[seed-reviews] Error:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
