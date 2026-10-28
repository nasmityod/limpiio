import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  value: '', tail: Promise.resolve(), lockedReads: 0,
  transaction: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: db.transaction } }));
import { DEFAULT_SETTINGS, patchSettings } from '@/lib/data-store';

describe('settings domain merge uses the locked current value', () => {
  beforeEach(() => {
    db.value = JSON.stringify(DEFAULT_SETTINGS); db.tail = Promise.resolve(); db.lockedReads = 0;
    db.transaction.mockImplementation(async (fn) => {
      let release: (() => void) | undefined;
      let locked = false;
      const tx = {
        appConfig: {
          upsert: async () => {},
          findUniqueOrThrow: async () => { expect(locked).toBe(true); db.lockedReads++; return { value: db.value }; },
          update: async ({ data }: { data: { value: string } }) => { db.value = data.value; },
        },
        $queryRaw: async (parts: TemplateStringsArray) => {
          expect(parts.join('')).toContain('FOR UPDATE');
          const previous = db.tail;
          db.tail = new Promise<void>(resolve => { release = resolve; });
          await previous; locked = true;
        },
      };
      try { return await fn(tx); } finally { release?.(); }
    });
  });

  it('concurrent financial and contact saves preserve both domains', async () => {
    await Promise.all([
      patchSettings({ phone: '04121234567', storeName: 'Nueva tienda' }),
      patchSettings({ pagoMovil: { bank: '0102', phone: '04129999999', idNumber: 'V12345' } }),
    ]);
    const stored = JSON.parse(db.value);
    expect(stored.phone).toBe('04121234567');
    expect(stored.pagoMovil.bank).toBe('0102');
    expect(db.lockedReads).toBe(2);
  });

  it('corrupt stored settings are not replaced with defaults on save', async () => {
    db.value = '{broken';
    await expect(patchSettings({ phone: 'new' })).rejects.toThrow();
    expect(db.value).toBe('{broken');
  });

  it('incomplete financial groups fail without touching the stored JSON', async () => {
    const old = db.value;
    await expect(patchSettings({ pagoMovil: { bank: '0102', phone: '', idNumber: '' } })).rejects.toThrow();
    expect(db.value).toBe(old);
  });
});
