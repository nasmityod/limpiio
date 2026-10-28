#!/usr/bin/env node
/**
 * Dev helper — siembra un dataset grande en una BD de PRUEBAS para medir el
 * rendimiento del Panel Admin (auditoría docs/AUDITORIA-RENDIMIENTO-PANEL-ADMIN.md).
 *
 * Uso:
 *   node scripts/perf-seed.mjs --products 5000 --orders 20000 --reviews 5000
 *
 * Seguridad: se NIEGA a escribir si el nombre de la base no contiene `perf` o
 * `test`. Nunca apunta a producción. La URL sale de PERF_DATABASE_URL.
 */
import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  const value = process.argv[i + 1];
  if (!['products', 'orders', 'reviews'].includes(key) || key in args || !/^\d+$/.test(value ?? '')) {
    throw new Error('Uso: --products N --orders N --reviews N (enteros, sin opciones repetidas).');
  }
  args[key] = Number(value);
}
const boundedCount = (key, fallback, min, max) => {
  const value = args[key] ?? fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`--${key} debe estar entre ${min} y ${max}.`);
  }
  return value;
};
const nProducts = boundedCount('products', 1000, 1, 100000);
const nOrders = boundedCount('orders', 5000, 0, 500000);
const nReviews = boundedCount('reviews', 1000, 0, 250000);

const rawUrl = process.env.PERF_DATABASE_URL;
if (!rawUrl) {
  console.error('Falta PERF_DATABASE_URL (base de pruebas dedicada).');
  process.exit(1);
}
let url;
try { url = new URL(rawUrl); }
catch { throw new Error('PERF_DATABASE_URL no es una URL PostgreSQL válida.'); }
if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PERF_DATABASE_URL debe usar PostgreSQL.');
url.searchParams.delete('pgbouncer');
const dbName = decodeURIComponent(url.pathname.slice(1));
if (!/perf|test/i.test(dbName)) {
  console.error(`Rechazado: "${dbName}" no parece una base de pruebas (debe contener perf/test).`);
  process.exit(1);
}

const CATEGORIES = [
  'Tecnología', 'Hogar', 'Cocina', 'Fitness', 'Salud y Cuidado Personal',
  'Herramientas', 'Automotriz', 'Audio', 'Accesorios Apple', 'Gaming',
];
const BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Anker', 'Logitech', 'Sin Marca', 'JBL', 'HP'];
const WORDS = ['Cable', 'Cargador', 'Audífonos', 'Soporte', 'Batería', 'Adaptador', 'Funda',
  'Teclado', 'Mouse', 'Lámpara', 'Licuadora', 'Reloj', 'Cámara', 'Parlante', 'Monitor'];

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const cuid = () => 'c' + crypto.randomBytes(12).toString('hex');

const c = new pg.Client({ connectionString: url.toString() });
await c.connect();

try {
const actual = await c.query('SELECT current_database() AS name');
if (actual.rows[0]?.name !== dbName || !/perf|test/i.test(actual.rows[0]?.name ?? '')) {
  throw new Error('La base conectada no coincide con la base de pruebas solicitada.');
}

console.log(`Sembrando en ${dbName}: ${nProducts} productos, ${nOrders} pedidos, ${nReviews} reseñas…`);

await c.query('BEGIN');
// These durable jobs/tombstones deliberately have no FK cascade. A dedicated
// performance fixture must not inherit email jobs, orphan media or old attempts.
await c.query('TRUNCATE "EmailDelivery","CheckoutAttempt","CartReminderPreference","ReviewPhotoUpload","PaymentUpload","VideoJob","RestockSubscription","AbandonedCart","OrderItem","Order","Review","ProductMedia","ProductView","Product" RESTART IDENTITY CASCADE');

const now = Date.now();
const DAY = 86_400_000;

// ── Productos ──────────────────────────────────────────────────────────────
const productIds = [];
const productSnapshots = new Map();
const CHUNK = 500;
for (let start = 0; start < nProducts; start += CHUNK) {
  const values = [];
  const params = [];
  let p = 1;
  for (let i = start; i < Math.min(start + CHUNK, nProducts); i++) {
    const id = cuid();
    productIds.push(id);
    const name = `${pick(WORDS)} ${pick(BRANDS)} modelo ${i}`;
    const createdAt = new Date(now - rnd(720) * DAY);
    const priceCents = 500 + rnd(90000);
    productSnapshots.set(id, { name, priceCents });
    params.push(
      id, name, `producto-perf-${i}`, `MT-PERF-${i}`,
      `Descripción larga de prueba para ${name}. `.repeat(6),
      (priceCents / 100).toFixed(2),
      (3 + rnd(60000) / 100).toFixed(2),
      rnd(10) === 0 ? 0 : rnd(40),
      pick(CATEGORIES), pick(BRANDS),
      [`https://cdn.e2e.test/products/perf-${i}-a.webp`, `https://cdn.e2e.test/products/perf-${i}-b.webp`],
      i % 7 !== 0, i % 5 === 0, createdAt, createdAt,
      JSON.stringify([{ name: 'Color', value: 'Negro' }, { name: 'Garantía', value: '3 meses' }]),
    );
    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++}::jsonb)`);
  }
  await c.query(
    `INSERT INTO "Product" (id,name,slug,sku,description,price,cost,stock,category,brand,images,"isActive","freeShipping","createdAt","updatedAt",specs)
     VALUES ${values.join(',')}`,
    params,
  );
}
console.log(`  ✔ ${productIds.length} productos`);

// ── Media (1–3 por producto) ───────────────────────────────────────────────
for (let start = 0; start < productIds.length; start += CHUNK) {
  const values = []; const params = []; let p = 1;
  for (const pid of productIds.slice(start, start + CHUNK)) {
    const n = 1 + rnd(3);
    for (let k = 0; k < n; k++) {
      params.push(cuid(), pid, 'IMAGE', `https://cdn.e2e.test/products/${pid}-${k}.webp`, k);
      values.push(`($${p++},$${p++},$${p++}::"ProductMediaType",$${p++},$${p++})`);
    }
  }
  if (values.length) {
    await c.query(`INSERT INTO "ProductMedia" (id,"productId",type,url,"sortOrder") VALUES ${values.join(',')}`, params);
  }
}
console.log('  ✔ media');

// ── Pedidos ────────────────────────────────────────────────────────────────
const STATUSES = ['Pendiente', 'Pendiente verificación Binance', 'En Proceso', 'Enviado', 'Entregado', 'Cancelado'];
const orderIds = [];
for (let start = 0; start < nOrders; start += CHUNK) {
  const values = []; const params = []; let p = 1;
  const itemValues = []; const itemParams = []; let ip = 1;
  for (let i = start; i < Math.min(start + CHUNK, nOrders); i++) {
    const id = cuid();
    orderIds.push(id);
    const status = pick(STATUSES);
    // ~15 % legado sin tasa (total ya en USD), el resto con tasa congelada.
    const legacy = i % 7 === 0;
    const rate = legacy ? null : (36 + rnd(30000) / 100).toFixed(2);
    const createdAt = new Date(now - rnd(500) * DAY);
    const paid = ['En Proceso', 'Enviado', 'Entregado'].includes(status);
    const paidAt = paid ? createdAt : null;
    let totalCents = 0;
    for (let k = 0, count = 1 + rnd(3); k < count; k++) {
      const pid = pick(productIds);
      const product = productSnapshots.get(pid);
      const quantity = 1 + rnd(3);
      const priceCents = legacy ? product.priceCents : Math.round(product.priceCents * Number(rate));
      totalCents += priceCents * quantity;
      itemParams.push(cuid(), id, pid, product.name, (priceCents / 100).toFixed(2), quantity);
      itemValues.push(`($${ip++},$${ip++},$${ip++},$${ip++},$${ip++},$${ip++})`);
    }
    const total = (totalCents / 100).toFixed(2);
    params.push(id, i + 1, `Cliente Perf ${i}`, `perf${i}@example.test`, `0414${String(i).padStart(7, '0')}`,
      status, total, rate, createdAt, createdAt, 'Pago Móvil', 'Barquisimeto', 'Lara', 'Calle perf 123',
      paidAt, status === 'Enviado' || status === 'Entregado' ? createdAt : null,
      status === 'Entregado' ? createdAt : null, status !== 'Cancelado');
    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
  }
  await c.query(
    `INSERT INTO "Order" (id,"orderNumber","customerName","customerEmail","customerPhone",status,total,"exchangeRateUsdBs","createdAt","updatedAt","paymentMethod","shippingCity","shippingState","shippingAddress","paidAt","shippedAt","deliveredAt","stockDeducted")
     VALUES ${values.join(',')}`,
    params,
  );
  await c.query(`INSERT INTO "OrderItem" (id,"orderId","productId","productName",price,quantity) VALUES ${itemValues.join(',')}`, itemParams);
}
console.log(`  ✔ ${orderIds.length} pedidos`);

// ── OrderItems (1–3 por pedido) ────────────────────────────────────────────
console.log('  ✔ order items');

// ── Reseñas ────────────────────────────────────────────────────────────────
const RSTATUS = ['PENDING', 'APPROVED', 'REJECTED'];
for (let start = 0; start < nReviews; start += CHUNK) {
  const values = []; const params = []; let p = 1;
  for (let i = start; i < Math.min(start + CHUNK, nReviews); i++) {
    const createdAt = new Date(now - rnd(400) * DAY);
    params.push(cuid(), pick(productIds), `Reseñador ${i}`, 1 + rnd(5),
      `Comentario de prueba número ${i}. `.repeat(4), pick(RSTATUS),
      createdAt, createdAt);
    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++}::"ReviewStatus",$${p++},$${p++})`);
  }
  await c.query(
    `INSERT INTO "Review" (id,"productId","authorName",rating,comment,status,"createdAt","updatedAt") VALUES ${values.join(',')}`,
    params,
  );
}
console.log(`  ✔ ${nReviews} reseñas`);

// Explicit order numbers do not advance the SERIAL sequence. A subsequent
// checkout in this dedicated fixture must start after the seeded maximum.
await c.query(`SELECT setval(pg_get_serial_sequence('"Order"', 'orderNumber'), COALESCE(MAX("orderNumber"), 1), MAX("orderNumber") IS NOT NULL) FROM "Order"`);
await c.query('COMMIT');
await c.query('ANALYZE');
console.log('Listo.');
} catch (error) {
  await c.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await c.end();
}
