/**
 * e2e-reset-db.ts
 *
 * Resetea y siembra la BD de E2E con datos deterministas.
 * SEGURIDAD: aborta si DATABASE_URL no apunta a BD/host con "_e2e" o "test".
 * Uso: tsx scripts/e2e-reset-db.ts
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { assertE2eDatabaseUrl, confirmE2eDatabaseSchema } from '@/lib/e2e-db-guard';
import { hashToken } from '@/lib/security';
import { createScriptPrisma } from './lib/script-prisma';
import {
  E2E_ADMIN,
  E2E_CLIENT,
  E2E_COUPON,
  E2E_PRODUCTS,
  E2E_RESET_TOKENS,
  E2E_RBAC,
} from '../e2e/fixtures/constants';

assertE2eDatabaseUrl(process.env.DATABASE_URL ?? '');

const prisma = createScriptPrisma();

async function main() {
  await confirmE2eDatabaseSchema(async () => {
    const rows = await prisma.$queryRaw<{ current_database: string }[]>`
      SELECT current_database()
    `;
    return rows[0]?.current_database ?? '';
  });

  console.log('[e2e-reset] Limpiando y sembrando BD E2E...');

  const [
    adminHash,
    clientHash,
    pedidosHash,
    pedidosYPagosHash,
    catalogoHash,
    finanzasHash,
    settingsGeneralHash,
    analiticaHash,
    exportacionHash,
    sinPermisosHash,
    legacyAdminHash,
  ] = await Promise.all([
    bcrypt.hash(E2E_ADMIN.password, 12),
    bcrypt.hash(E2E_CLIENT.password, 12),
    bcrypt.hash(E2E_RBAC.pedidos.password, 12),
    bcrypt.hash(E2E_RBAC.pedidosYPagos.password, 12),
    bcrypt.hash(E2E_RBAC.catalogo.password, 12),
    bcrypt.hash(E2E_RBAC.finanzas.password, 12),
    bcrypt.hash(E2E_RBAC.settingsGeneral.password, 12),
    bcrypt.hash(E2E_RBAC.analitica.password, 12),
    bcrypt.hash(E2E_RBAC.exportacion.password, 12),
    bcrypt.hash(E2E_RBAC.sinPermisos.password, 12),
    bcrypt.hash(E2E_RBAC.legacyAdminSinPermisos.password, 12),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.couponRedemption.deleteMany();
    await tx.paymentUpload.deleteMany();
    await tx.orderItem.deleteMany();
    await tx.order.deleteMany();
    await tx.cartItem.deleteMany();
    await tx.cart.deleteMany();
    await tx.wishlistItem.deleteMany();
    await tx.review.deleteMany();
    await tx.productView.deleteMany();
    await tx.passwordResetToken.deleteMany();
    await tx.abandonedCart.deleteMany();
    await tx.restockSubscription.deleteMany();
    await tx.videoJob.deleteMany();
    await tx.coupon.deleteMany();
    await tx.productMedia.deleteMany();
    await tx.product.deleteMany();
    await tx.category.deleteMany();
    await tx.promotion.deleteMany();
    await tx.banner.deleteMany();
    await tx.savedAddress.deleteMany();
    await tx.permissionAuditLog.deleteMany();
    await tx.user.deleteMany();
    await tx.appConfig.deleteMany();

    await tx.user.create({
      data: {
        name: E2E_ADMIN.name,
        email: E2E_ADMIN.email,
        password: adminHash,
        role: 'ADMIN',
        isSuperAdmin: true,
        adminPermissions: [],
      },
    });

    // SoloPedidos — solo ORDERS
    await tx.user.create({
      data: {
        name: E2E_RBAC.pedidos.name,
        email: E2E_RBAC.pedidos.email,
        password: pedidosHash,
        role: 'ADMIN',
        adminPermissions: ['ORDERS'],
      },
    });

    // PedidosYPagos — ORDERS + PAYMENTS
    await tx.user.create({
      data: {
        name: E2E_RBAC.pedidosYPagos.name,
        email: E2E_RBAC.pedidosYPagos.email,
        password: pedidosYPagosHash,
        role: 'ADMIN',
        adminPermissions: ['ORDERS', 'PAYMENTS'],
      },
    });

    // SoloCatalogo — CATALOG
    await tx.user.create({
      data: {
        name: E2E_RBAC.catalogo.name,
        email: E2E_RBAC.catalogo.email,
        password: catalogoHash,
        role: 'ADMIN',
        adminPermissions: ['CATALOG'],
      },
    });

    // SoloFinanzas — FINANCIAL_SETTINGS
    await tx.user.create({
      data: {
        name: E2E_RBAC.finanzas.name,
        email: E2E_RBAC.finanzas.email,
        password: finanzasHash,
        role: 'ADMIN',
        adminPermissions: ['FINANCIAL_SETTINGS'],
      },
    });

    // SoloSettingsGeneral — STORE_SETTINGS
    await tx.user.create({
      data: {
        name: E2E_RBAC.settingsGeneral.name,
        email: E2E_RBAC.settingsGeneral.email,
        password: settingsGeneralHash,
        role: 'ADMIN',
        adminPermissions: ['STORE_SETTINGS'],
      },
    });

    // SoloAnalitica — ANALYTICS
    await tx.user.create({
      data: {
        name: E2E_RBAC.analitica.name,
        email: E2E_RBAC.analitica.email,
        password: analiticaHash,
        role: 'ADMIN',
        adminPermissions: ['ANALYTICS'],
      },
    });

    // SoloExportacion — ORDERS + CUSTOMER_DATA_EXPORT
    await tx.user.create({
      data: {
        name: E2E_RBAC.exportacion.name,
        email: E2E_RBAC.exportacion.email,
        password: exportacionHash,
        role: 'ADMIN',
        adminPermissions: ['ORDERS', 'CUSTOMER_DATA_EXPORT'],
      },
    });

    // SinPermisos — role CLIENT (invariante: CLIENT sin permisos, no ADMIN)
    await tx.user.create({
      data: {
        name: E2E_RBAC.sinPermisos.name,
        email: E2E_RBAC.sinPermisos.email,
        password: sinPermisosHash,
        role: 'CLIENT',
        adminPermissions: [],
      },
    });

    // LegacyAdminSinPermisos — role ADMIN pero sin permisos (fixture separado para pruebas de invariante)
    await tx.user.create({
      data: {
        name: E2E_RBAC.legacyAdminSinPermisos.name,
        email: E2E_RBAC.legacyAdminSinPermisos.email,
        password: legacyAdminHash,
        role: 'ADMIN',
        adminPermissions: [],
      },
    });

    const client = await tx.user.create({
      data: {
        name: E2E_CLIENT.name,
        email: E2E_CLIENT.email,
        password: clientHash,
        role: 'CLIENT',
      },
    });

    await tx.passwordResetToken.create({
      data: {
        token: hashToken(E2E_RESET_TOKENS.valid),
        userId: client.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await tx.passwordResetToken.create({
      data: {
        token: hashToken(E2E_RESET_TOKENS.expired),
        userId: client.id,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    await tx.product.create({
      data: {
        name: E2E_PRODUCTS.inStock.name,
        slug: E2E_PRODUCTS.inStock.slug,
        description: 'Audífonos inalámbricos con cancelación de ruido para pruebas E2E.',
        price: E2E_PRODUCTS.inStock.price,
        stock: E2E_PRODUCTS.inStock.stock,
        category: E2E_PRODUCTS.inStock.category,
        brand: 'TestBrand',
        images: ['https://cdn.e2e.test/audifonos.jpg'],
        isActive: true,
      },
    });

    await tx.product.create({
      data: {
        name: E2E_PRODUCTS.noStock.name,
        slug: E2E_PRODUCTS.noStock.slug,
        description: 'Cargador rápido 65W para pruebas E2E.',
        price: E2E_PRODUCTS.noStock.price,
        stock: E2E_PRODUCTS.noStock.stock,
        category: E2E_PRODUCTS.noStock.category,
        brand: 'TestBrand',
        images: ['https://cdn.e2e.test/cargador.jpg'],
        isActive: true,
      },
    });

    await tx.coupon.create({
      data: {
        code: E2E_COUPON.code,
        description: '10% off para pruebas E2E',
        discountType: 'PERCENT',
        discountValue: E2E_COUPON.discountPercent,
        minPurchase: E2E_COUPON.minPurchase,
        maxDiscount: E2E_COUPON.maxDiscount,
        maxUses: 100,
        usedCount: 0,
        active: true,
      },
    });

    await tx.appConfig.create({
      data: {
        key: 'store_settings',
        value: JSON.stringify({
          storeName: 'MundoTech E2E',
          tagline: 'Tienda de pruebas E2E',
          phone: '0412-0000000',
          email: 'e2e@mundotechtest.com',
          address: 'Dirección de prueba E2E',
          pagoMovil: { bank: 'TestBank', phone: '0412-0000000', idNumber: 'V-00000000' },
          transferencia: {
            bank: 'TestBank',
            accountNumber: '0000-0000-00-00000000',
            accountHolder: 'Test E2E',
            rif: 'J-00000000-0',
          },
          binancePayId: '',
          binanceQrUrl: '',
          labelWidthMm: 100,
          labelHeightMm: 150,
          whatsappOrderPhone: '584121471338',
        }),
      },
    });
  });

  console.log('[e2e-reset] Seed completado.');
}

main()
  .catch((e) => {
    console.error('[e2e-reset] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
