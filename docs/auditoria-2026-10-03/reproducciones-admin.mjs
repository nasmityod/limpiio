/** Reproducciones aisladas: evalúan schemas/helpers/callbacks reales, sin red, DB o R2. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { z } = require('zod');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tree = file => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true,
  file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function find(file, predicate) {
  let result;
  function visit(node) { if (!result && predicate(node)) result = node; ts.forEachChild(node, visit); }
  visit(tree(file));
  if (!result) throw new Error(`No se encontró nodo esperado en ${file}`);
  return result;
}
function variable(file, name) {
  return find(file, node => ts.isVariableDeclaration(node) && node.name.getText() === name).initializer;
}
function evaluate(node, scope = {}) {
  const code = ts.transpileModule(`const auditValue = ${node.getText()};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return Function(...Object.keys(scope), `${code}\nreturn auditValue;`)(...Object.values(scope));
}
function pureModule(file, deps = {}) {
  const code = ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  Function('module', 'exports', 'require', code)(mod, mod.exports,
    name => { if (!(name in deps)) throw new Error(`Dependencia no permitida ${name}`); return deps[name]; });
  return mod.exports;
}
function namedFunction(file, name, scope = {}) {
  const node = find(file, current => ts.isFunctionDeclaration(current) && current.name?.text === name);
  const expression = node.getText().replace(/^export\s+/, '');
  return evaluate({ getText: () => expression }, scope);
}
const safe = pureModule('lib/safe-link.ts');
const media = pureModule('lib/media.ts');
const productMedia = pureModule('lib/product-media.ts', { '@/lib/media': media });
const freeShipping = pureModule('lib/csv-free-shipping.ts');
const pricing = pureModule('lib/pricing-formula.ts');
const productSchema = evaluate(variable('app/actions/productActions.ts', 'productSchema'), {
  z, normalizeCategoryName: value => value.trim().replace(/\s+/g, ' '),
  parseFreeShippingFormValue: freeShipping.parseFreeShippingFormValue,
});
const gallery = productMedia.deriveLegacyImagesFromSlots([]);
const emptyProduct = productSchema.safeParse({
  name: 'Auditoría', description: 'Prueba aislada', price: 10, cost: '', originalPrice: '',
  salePrice: '', marginPct: '', stock: 1, category: 'General', brand: '', sku: '',
  freeShipping: 'false', imagesJson: JSON.stringify(gallery),
});
const results = [{ id: 'ADM-05', gallery, accepted: emptyProduct.success,
  errors: emptyProduct.success ? [] : emptyProduct.error.issues.map(i => ({ path: i.path, message: i.message })) }];
results.push({ id: 'ADM-23', externalImage: 'https://ejemplo.com/imagen.jpg',
  acceptedByProductSchema: productSchema.safeParse({ name: 'Prueba', description: 'Prueba', price: 10,
    cost: '', originalPrice: '', salePrice: '', marginPct: '', stock: 1, category: 'General',
    brand: '', sku: '', freeShipping: 'false', imagesJson: JSON.stringify(['https://ejemplo.com/imagen.jpg']) }).success,
  acceptedByEditableBannerValidator: safe.isSafeEditableImageUrl('https://ejemplo.com/imagen.jpg') });
const originalNodeEnv = process.env.NODE_ENV;
const nextImageConfig = { path: '/_next/image', qualities: [75], domains: [],
  remotePatterns: [{ protocol: 'https', hostname: 'cdn.audit.test', pathname: '/**' }] };
const nextImageLoader = require('next/dist/shared/lib/image-loader').default;
let developmentImageLoaderError = '';
process.env.NODE_ENV = 'development';
try { nextImageLoader({ config: nextImageConfig, src: 'https://ejemplo.com/imagen.jpg', width: 640 }); }
catch (error) { developmentImageLoaderError = error.message; }
process.env.NODE_ENV = 'production';
const productionImageLoaderUrl = nextImageLoader({ config: nextImageConfig, src: 'https://ejemplo.com/imagen.jpg', width: 640 });
const productionImageParams = require('next/dist/server/image-optimizer').ImageOptimizerCache.validateParams(
  { headers: {} }, { url: 'https://ejemplo.com/imagen.jpg', w: '640', q: '75' },
  { images: nextImageConfig }, false,
);
if (originalNodeEnv == null) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
results.push({ id: 'ADM-23', developmentImageLoaderError, productionLoaderThrows: false,
  productionImageLoaderUrl, productionOptimizerValidation: productionImageParams,
  productionOutcome: 'Optimizer rejects URL (HTTP400); no production page crash demonstrated' });
for (const [prefix, schemaName] of [['banners', 'bannerSchema'], ['promotions', 'promotionSchema']]) {
  const postFile = `app/api/${prefix}/route.ts`;
  const putFile = `app/api/${prefix}/[id]/route.ts`;
  const scope = { z, ...safe };
  if (prefix === 'banners') {
    scope.FOCAL_POINTS = evaluate(variable(postFile, 'FOCAL_POINTS'));
    scope.BANNER_TYPES = evaluate(variable(putFile, 'BANNER_TYPES'));
  }
  const postSchema = evaluate(variable(postFile, schemaName), scope);
  const putSchema = evaluate(variable(putFile, schemaName), scope);
  const value = prefix === 'banners'
    ? { type: 'hero', imageUrl: '/banners/hero.png' }
    : { title: 'Oferta de prueba', imageUrl: '/promos/test.png' };
  results.push({ id: 'ADM-12', resource: prefix, input: value,
    createAccepted: postSchema.safeParse(value).success, editAccepted: putSchema.safeParse(value).success });
}
let carrier = '';
const carrierCallback = find('app/components/admin/ShipOrderDialog.tsx', node =>
  ts.isArrowFunction(node) && node.getText().includes("if (e.target.value === '__custom__') return;"));
evaluate(carrierCallback, { setTrackingCarrier: next => { carrier = next; } })({ target: { value: '__custom__' } });
results.push({ id: 'ADM-06', selected: '__custom__', resultingCarrier: carrier, customInputVisible: !!carrier });
const statsFile = 'app/admin/stats/page.tsx';
const profitCallback = variable(statsFile, 'profitStats').arguments[0];
const profit = evaluate(profitCallback, {
  sortedProducts: [{ productId: 'known', revenue: 100, quantity: 1 }, { productId: 'unknown', revenue: 100, quantity: 1 }],
  productCosts: { known: 50 },
})();
const pendingCallback = variable(statsFile, 'pendingVerifyCount').arguments[0];
const pending = evaluate(pendingCallback, { stats: { byStatus: [
  { status: 'Pendiente', count: 9 }, { status: 'Pendiente verificación Binance', count: 4 },
] } })();
results.push({ id: 'ADM-19', profitActual: profit,
  profitIfUnknownIgnored: { profit: 50, marginPct: 50 }, pendingActual: pending, pendingExpected: 13 });
const categoryUpdate = evaluate(variable('app/api/categories/[id]/route.ts', 'categoryUpdateSchema'), {
  z, sanitizeOrderItemImageUrl: url => url.startsWith('/') ? url : null,
});
let categoryAfter = { name: 'Accesorios', slug: 'accesorios' };
const productAfterRename = { category: 'Accesorios' };
const categoryPut = namedFunction('app/api/categories/[id]/route.ts', 'PUT', {
  rejectInvalidMutationOrigin: () => null, requirePermission: async () => ({ authorized: true }),
  categoryUpdateSchema: categoryUpdate,
  prisma: { category: { findUnique: async () => ({ slug: categoryAfter.slug }),
    update: async ({ data }) => { categoryAfter = data; return categoryAfter; } },
    product: { updateMany: async ({ data }) => { Object.assign(productAfterRename, data); } } },
  saveSlugRedirect: async () => {}, revalidatePath: () => {}, revalidateTag: () => {}, logError: () => {},
  CACHE_TAG_CATEGORIES: 'categories', CACHE_TAG_SITE_SHELL: 'shell',
  NextResponse: { json: value => value },
});
await categoryPut(new Request('http://localhost/api/categories/test', { method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Accesorios y cables', slug: 'accesorios-y-cables' }),
}), { params: Promise.resolve({ id: 'test-category' }) });
results.push({ id: 'ADM-01', renamedCategory: categoryAfter.name, productCategory: productAfterRename.category,
  matchesPublicCategoryFilter: categoryAfter.name.toLowerCase() === productAfterRename.category.toLowerCase() });
const categoryError = categoryUpdate.safeParse({ name: 'x'.repeat(81), slug: 'prueba' });
let renderError = '';
if (!categoryError.success) {
  try { renderToStaticMarkup(React.createElement('span', null, categoryError.error.flatten())); }
  catch (err) { renderError = err.message; }
}
results.push({ id: 'ADM-08', errorPayload: categoryError.success ? null : categoryError.error.flatten(), renderError });
const originalTimezone = process.env.TZ;
process.env.TZ = 'UTC';
const utcDate = new Date('2026-10-03T18:00').toISOString();
process.env.TZ = 'America/Caracas';
const caracasDate = new Date('2026-10-03T18:00').toISOString();
if (originalTimezone == null) delete process.env.TZ; else process.env.TZ = originalTimezone;
results.push({ id: 'ADM-13', browserInput: '2026-10-03T18:00', storedWithUtcServer: utcDate,
  storedWithCaracasServer: caracasDate, hoursDifference: 4 });
results.push({ id: 'ADM-11', baseFactorBefore: 1.5, currentFactor: 2, enteredPrice: 100,
  nextRecalculation: pricing.roundUpToStep(100 * (2 / 1.5)) });
const pricingSchema = evaluate(variable('app/actions/configActions.ts', 'pricingParamsSchema'), { z });
const factor = 1.234;
const storedFactor = 1.23; // SELECT 1.234::numeric(6,2) en PostgreSQL aislado confirmó 1.23.
let repeatedPrice = 100;
const recalcSequence = [];
for (let i = 0; i < 3; i++) {
  repeatedPrice = pricing.roundUpToStep(repeatedPrice * (factor / storedFactor));
  recalcSequence.push(repeatedPrice);
}
results.push({ id: 'ADM-11', factorAcceptedBySettings: pricingSchema.safeParse({ marginPct: 80, factor }).success,
  factor, storedFactor, sameFactorRepeatedRecalculation: recalcSequence });
let bannersAfter = [{ id: 'banner-1', active: true }];
await evaluate(variable('app/admin/banners/page.tsx', 'handleDelete'), {
  confirm: () => true, fetch: async () => ({ ok: false, status: 500 }),
  setBanners: update => { bannersAfter = update(bannersAfter); },
})('banner-1');
results.push({ id: 'ADM-07', deleteHttpStatus: 500, localBannersAfterFailedDelete: bannersAfter });
const noop = () => {};
let storedStock;
const staleUpdate = namedFunction('app/actions/productActions.ts', 'updateProductAction', {
  verifyAdminSession: async () => {}, productSchema, getPricingParams: async () => ({ factor: 1.5 }),
  calcSellingPriceUsd: pricing.calcSellingPriceUsd, roundUpToStep: pricing.roundUpToStep,
  parseGallerySlots: (_fd, urls) => urls.map(url => ({ type: 'IMAGE', url })),
  deriveLegacyImagesFromSlots: productMedia.deriveLegacyImagesFromSlots, parseSpecsFromFormData: () => [],
  prisma: { product: { findUnique: async () => ({ name: 'Prueba', slug: 'prueba', sku: 'AUDIT',
    stock: 2, category: 'General', images: ['https://cdn.test/item.png'], media: [] }) } },
  withSerializableCategoryTransaction: async callback => callback({
    productMedia: { deleteMany: async () => {} },
    product: { update: async ({ data }) => { storedStock = data.stock; } },
  }),
  ensureProductCategory: async () => ({ name: 'General', created: false }),
  ProductMediaType: { IMAGE: 'IMAGE', VIDEO: 'VIDEO' }, Prisma: { JsonNull: null },
  cleanupRemovedProductMedia: async () => {}, triggerRestockNotifications: async () => {},
  revalidatePath: noop, revalidateTag: noop, pingIndexNow: async () => {}, logError: noop,
  CACHE_TAG_CATEGORIES: 'categories', CACHE_TAG_SITE_SHELL: 'site-shell',
  CategoryNameError: class CategoryNameError extends Error {},
});
const fd = new FormData();
Object.entries({ name: 'Prueba', description: 'Editada', price: '10', cost: '', originalPrice: '',
  salePrice: '', marginPct: '', stock: '3', category: 'General', brand: 'Prueba', sku: 'AUDIT',
  freeShipping: 'false', imagesJson: JSON.stringify(['https://cdn.test/item.png']),
}).forEach(([key, value]) => fd.set(key, value));
const staleResult = await staleUpdate('audit-product', fd);
results.push({ id: 'ADM-02', stockWhenModalOpened: 3, stockInDbAfterSale: 2,
  stockWrittenByDescriptionEdit: storedStock, actionSuccess: staleResult.success });
const phoneHelpers = pureModule('lib/whatsapp-phone.ts');
const generalSchema = evaluate(variable('app/actions/settingsActions.ts', 'generalSettingsSchema'), { z, ...safe, ...phoneHelpers });
const financialSchema = evaluate(variable('app/actions/settingsActions.ts', 'financialSettingsSchema'), { z });
const initialSettings = { storeName: 'Prueba', phone: 'original', email: 'audit@example.test',
  pagoMovil: { bank: 'original', phone: '584120000000', idNumber: '1234567' },
  transferencia: { bank: '', accountNumber: '', accountHolder: '', rif: '' },
  binancePayId: '', binanceQrUrl: '', paymentMethods: [], divisaDiscountEnabled: false, divisaDiscountPercent: 0 };
let concurrentSettings = structuredClone(initialSettings);
let readCount = 0;
let releaseSettingsReads;
const bothSettingsRead = new Promise(resolve => { releaseSettingsReads = resolve; });
const readSettings = async () => {
  const snapshot = structuredClone(concurrentSettings);
  if (++readCount === 2) releaseSettingsReads();
  await bothSettingsRead;
  return snapshot;
};
const settingsScope = {
  requirePermissionAction: async () => {}, generalSettingsSchema: generalSchema, financialSettingsSchema: financialSchema,
  storeSettingsSchema: { safeParse: data => ({ success: true, data }) },
  writeSettings: async value => { concurrentSettings = structuredClone(value); },
  revalidatePath: noop, revalidateTag: noop, pickGeneralSettingsDto: data => data, pickFinancialSettingsDto: data => data,
  require: name => {
    if (name === '@/lib/data-store') return { readSettings };
    if (name === '@/lib/payment-methods') return { parseAndNormalizePaymentMethods: methods => ({ ok: true, methods }) };
    throw new Error(`Dependencia no permitida: ${name}`);
  },
};
await Promise.all([
  namedFunction('app/actions/settingsActions.ts', 'updateGeneralStoreSettings', settingsScope)({
    storeName: 'Prueba', phone: 'telefono-nuevo', email: 'audit@example.test',
  }),
  namedFunction('app/actions/settingsActions.ts', 'updateFinancialSettings', settingsScope)({
    pagoMovil: { bank: 'banco-nuevo', phone: '584120000000', idNumber: '1234567' },
    transferencia: initialSettings.transferencia, binancePayId: '', binanceQrUrl: '', paymentMethods: [],
  }),
]);
results.push({ id: 'ADM-03', savedPhone: concurrentSettings.phone, savedBank: concurrentSettings.pagoMovil.bank,
  bothChangesRetained: concurrentSettings.phone === 'telefono-nuevo' && concurrentSettings.pagoMovil.bank === 'banco-nuevo' });
let loadingMoreAfter = false;
let finishOldFetch;
const requestIdRef = { current: 1 };
const loadMore = evaluate(variable('app/admin/orders/page.tsx', 'loadMoreOrders').arguments[0], {
  nextCursor: 'old-cursor', loadingMore: false, requestIdRef, PAGE_SIZE: 50, tab: 'all', qFromUrl: '',
  setLoadingMore: value => { loadingMoreAfter = value; }, setError: noop,
  buildOrdersQuery: namedFunction('app/admin/orders/page.tsx', 'buildOrdersQuery'),
  fetch: () => new Promise(resolve => { finishOldFetch = resolve; }),
  setOrders: noop, setNextCursor: noop,
});
const oldRequest = loadMore();
requestIdRef.current++;
finishOldFetch({ ok: true, json: async () => ({ orders: [], nextCursor: null }) });
await oldRequest;
results.push({ id: 'ADM-21', filterChangedDuringLoadMore: true, loadingMoreAfterRequestFinished: loadingMoreAfter });
const crontab = read('deploy/crontab.vps');
results.push({ id: 'OPS-01', backupScheduled: crontab.includes('backup-postgres.sh'),
  casheaScheduled: crontab.includes('cashea-reconcile') });
console.log(JSON.stringify(results, null, 2));
