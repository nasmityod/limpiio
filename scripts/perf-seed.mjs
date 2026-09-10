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

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v]),
);

const nProducts = Number(args.products ?? 1000);
const nOrders = Number(args.orders ?? 5000);
const nReviews = Number(args.reviews ?? 1000);

const rawUrl = process.env.PERF_DATABASE_URL;
if (!rawUrl) {
  console.error('Falta PERF_DATABASE_URL (base de pruebas dedicada).');
  process.exit(1);
}
const url = new URL(rawUrl.replace('?pgbouncer=true', ''));
const dbName = url.pathname.replace('/', '');
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

console.log(`Sembrando en ${dbName}: ${nProducts} productos, ${nOrders} pedidos, ${nReviews} reseñas…`);

await c.query('TRUNCATE "OrderItem","Order","Review","ProductMedia","ProductView","Product" CASCADE');

const now = Date.now();
const DAY = 86_400_000;

// ── Productos ──────────────────────────────────────────────────────────────
const productIds = [];
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
    params.push(
      id, name, `producto-perf-${i}`, `MT-PERF-${i}`,
      `Descripción larga de prueba para ${name}. `.repeat(6),
      (5 + rnd(90000) / 100).toFixed(2),
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
  for (let i = start; i < Math.min(start + CHUNK, nOrders); i++) {
    const id = cuid();
    orderIds.push(id);
    const status = pick(STATUSES);
    // ~15 % legado sin tasa (total ya en USD), el resto con tasa congelada.
    const legacy = i % 7 === 0;
    const rate = legacy ? null : (36 + rnd(30000) / 100).toFixed(2);
    const total = legacy ? (10 + rnd(90000) / 100).toFixed(2) : (400 + rnd(9_000_000) / 100).toFixed(2);
    const createdAt = new Date(now - rnd(500) * DAY);
    params.push(id, i + 1, `Cliente Perf ${i}`, `perf${i}@example.test`, `0414${String(i).padStart(7, '0')}`,
      status, total, rate, createdAt, createdAt, 'Pago Móvil', 'Barquisimeto', 'Lara', 'Calle perf 123');
    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
  }
  await c.query(
    `INSERT INTO "Order" (id,"orderNumber","customerName","customerEmail","customerPhone",status,total,"exchangeRateUsdBs","createdAt","updatedAt","paymentMethod","shippingCity","shippingState","shippingAddress")
     VALUES ${values.join(',')}`,
    params,
  );
}
console.log(`  ✔ ${orderIds.length} pedidos`);

// ── OrderItems (1–3 por pedido) ────────────────────────────────────────────
for (let start = 0; start < orderIds.length; start += 200) {
  const values = []; const params = []; let p = 1;
  for (const oid of orderIds.slice(start, start + 200)) {
    const n = 1 + rnd(3);
    for (let k = 0; k < n; k++) {
      const pid = pick(productIds);
      params.push(cuid(), oid, pid, `Producto ${pid.slice(0, 6)}`, (5 + rnd(50000) / 100).toFixed(2), 1 + rnd(3));
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
    }
  }
  await c.query(`INSERT INTO "OrderItem" (id,"orderId","productId","productName",price,quantity) VALUES ${values.join(',')}`, params);
}
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

await c.query('ANALYZE');
await c.end();
console.log('Listo.');
