import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCasheaConfig, isCasheaEnabled } from '@/lib/cashea-config';

const CASHEA_ENV_KEYS = [
  'CASHEA_ENABLED',
  'CASHEA_ENV',
  'CASHEA_API_BASE_URL',
  'CASHEA_PRIVATE_API_KEY',
  'CASHEA_EXTERNAL_CLIENT_ID',
  'CASHEA_STORE_ID',
  'CASHEA_STORE_NAME',
  'CASHEA_MERCHANT_NAME',
  'CASHEA_SDK_VERSION',
  'CASHEA_RESERVATION_MINUTES',
  'CASHEA_CURRENCY',
  'CASHEA_DELIVERY_PRICE',
  'NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY',
  'NEXT_PUBLIC_CASHEA_ENABLED',
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = {};
  for (const key of CASHEA_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of CASHEA_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe('getCasheaConfig — flag off (mínimos)', () => {
  it('no exige ninguna variable y devuelve defaults seguros', () => {
    const config = getCasheaConfig();

    expect(config.enabled).toBe(false);
    expect(config.publicEnabled).toBe(false);
    expect(config.environment).toBe('sandbox');
    expect(config.sdkVersion).toBe('1.1.19');
    expect(config.reservationMinutes).toBe(60);
    expect(config.currency).toBe('USD');
    expect(config.deliveryPrice).toBe(0);
    expect(config.apiBaseUrl).toBeNull();
    expect(config.privateApiKey).toBeNull();
    expect(config.storeId).toBeNull();
    expect(config.publicApiKey).toBeNull();
  });

  it('isCasheaEnabled() devuelve false por default', () => {
    expect(isCasheaEnabled()).toBe(false);
  });
});

function setFullValidConfig(): void {
  process.env.CASHEA_ENABLED = 'true';
  process.env.NEXT_PUBLIC_CASHEA_ENABLED = 'true';
  process.env.CASHEA_ENV = 'sandbox';
  process.env.CASHEA_API_BASE_URL = 'https://sandbox.cashea.example/api';
  process.env.CASHEA_PRIVATE_API_KEY = 'test-private-key';
  process.env.CASHEA_EXTERNAL_CLIENT_ID = 'client-123';
  process.env.CASHEA_STORE_ID = '42';
  process.env.CASHEA_STORE_NAME = 'MundoTech';
  process.env.CASHEA_MERCHANT_NAME = 'MundoTech VE';
  process.env.CASHEA_SDK_VERSION = '1.1.19';
  process.env.CASHEA_RESERVATION_MINUTES = '60';
  process.env.CASHEA_CURRENCY = 'USD';
  process.env.CASHEA_DELIVERY_PRICE = '0';
  process.env.NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY = 'test-public-key';
}

describe('getCasheaConfig — flag on completo (ok)', () => {
  it('devuelve la configuración completa sin lanzar', () => {
    setFullValidConfig();

    const config = getCasheaConfig();

    expect(config.enabled).toBe(true);
    expect(config.publicEnabled).toBe(true);
    expect(config.apiBaseUrl).toBe('https://sandbox.cashea.example/api');
    expect(config.privateApiKey).toBe('test-private-key');
    expect(config.externalClientId).toBe('client-123');
    expect(config.storeId).toBe(42);
    expect(config.storeName).toBe('MundoTech');
    expect(config.merchantName).toBe('MundoTech VE');
    expect(config.publicApiKey).toBe('test-public-key');
    expect(config.currency).toBe('USD');
    expect(config.deliveryPrice).toBe(0);
  });

  it('isCasheaEnabled() devuelve true', () => {
    setFullValidConfig();
    expect(isCasheaEnabled()).toBe(true);
  });
});

describe('getCasheaConfig — flag on con faltantes (error claro)', () => {
  it('lanza si falta CASHEA_API_BASE_URL', () => {
    setFullValidConfig();
    delete process.env.CASHEA_API_BASE_URL;

    expect(() => getCasheaConfig()).toThrowError(/CASHEA_API_BASE_URL/);
  });

  it('lanza listando TODAS las variables faltantes', () => {
    process.env.CASHEA_ENABLED = 'true';
    process.env.NEXT_PUBLIC_CASHEA_ENABLED = 'true';

    expect(() => getCasheaConfig()).toThrowError(
      /CASHEA_API_BASE_URL.*CASHEA_PRIVATE_API_KEY/,
    );
  });

  it('lanza si CASHEA_STORE_ID no es un entero positivo', () => {
    setFullValidConfig();
    process.env.CASHEA_STORE_ID = '-1';

    expect(() => getCasheaConfig()).toThrowError(/CASHEA_STORE_ID/);
  });

  it('lanza si CASHEA_ENABLED y NEXT_PUBLIC_CASHEA_ENABLED tienen valores no booleanos', () => {
    process.env.CASHEA_ENABLED = 'yes';

    expect(() => getCasheaConfig()).toThrowError(/CASHEA_ENABLED/);
  });
});
