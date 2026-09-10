import { describe, expect, it } from 'vitest';
import {
  normalizeCsvFreeShipping,
  parseFreeShippingFormValue,
} from '@/lib/csv-free-shipping';

describe('normalizeCsvFreeShipping', () => {
  it('importa true / sí / yes / on / 1', () => {
    for (const v of ['true', 'TRUE', '1', 'sí', 'si', 'yes', 'on', ' Sí ']) {
      expect(normalizeCsvFreeShipping(v)).toEqual({ ok: true, value: true });
    }
  });

  it('importa false / no / 0 / vacío', () => {
    for (const v of ['false', '0', 'no', '', '  ']) {
      expect(normalizeCsvFreeShipping(v)).toEqual({ ok: true, value: false });
    }
  });

  it('columna ausente (undefined) → value undefined (no sobrescribe existentes)', () => {
    expect(normalizeCsvFreeShipping(undefined)).toEqual({ ok: true, value: undefined });
  });

  it('valor desconocido falla sin activar el beneficio', () => {
    expect(normalizeCsvFreeShipping('maybe')).toEqual({ ok: false });
    expect(normalizeCsvFreeShipping('gratis')).toEqual({ ok: false });
    expect(normalizeCsvFreeShipping('2')).toEqual({ ok: false });
  });
});

describe('parseFreeShippingFormValue (checkbox FormData)', () => {
  it('crear sin marcar / false → false', () => {
    expect(parseFreeShippingFormValue('false')).toBe(false);
    expect(parseFreeShippingFormValue(false)).toBe(false);
    expect(parseFreeShippingFormValue(null)).toBe(false);
    expect(parseFreeShippingFormValue(undefined)).toBe(false);
    expect(parseFreeShippingFormValue('')).toBe(false);
  });

  it('crear marcado / true → true', () => {
    expect(parseFreeShippingFormValue('true')).toBe(true);
    expect(parseFreeShippingFormValue(true)).toBe(true);
    expect(parseFreeShippingFormValue('on')).toBe(true);
    expect(parseFreeShippingFormValue('1')).toBe(true);
  });
});
