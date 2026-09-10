import { describe, expect, it } from 'vitest';
import {
  buildTelHref,
  normalizePhoneDigits,
  normalizePhoneForCompare,
  resolveFooterPhoneLinks,
} from '@/lib/footer-phones';

describe('footer phones', () => {
  it('normalizePhoneDigits elimina no dígitos', () => {
    expect(normalizePhoneDigits('0426-123 4567')).toBe('04261234567');
  });

  it('colapsa el mismo número idéntico', () => {
    const links = resolveFooterPhoneLinks('04261234567', '04261234567');
    expect(links).toHaveLength(1);
    expect(links[0]?.display).toBe('04261234567');
  });

  it('colapsa mismo número con guiones/espacios distintos', () => {
    const links = resolveFooterPhoneLinks('0426-1234567', '0426 123 4567');
    expect(links).toHaveLength(1);
    expect(links[0]?.display).toBe('0426-1234567');
  });

  it('colapsa 0 local frente a 58 internacional', () => {
    expect(normalizePhoneForCompare('04261234567')).toBe('584261234567');
    expect(normalizePhoneForCompare('584261234567')).toBe('584261234567');
    const links = resolveFooterPhoneLinks('0426-1234567', '+58 426-1234567');
    expect(links).toHaveLength(1);
  });

  it('dos números diferentes tienen enlaces independientes', () => {
    const links = resolveFooterPhoneLinks('04261234567', '04141234567');
    expect(links).toHaveLength(2);
    expect(links[0]?.href).toBe(buildTelHref('04261234567'));
    expect(links[1]?.href).toBe(buildTelHref('04141234567'));
    expect(links[0]?.href).not.toBe(links[1]?.href);
  });

  it('phone2 vacío muestra solo phone', () => {
    const links = resolveFooterPhoneLinks('04261234567', '');
    expect(links).toHaveLength(1);
  });

  it('phone vacío no renderiza enlaces', () => {
    expect(resolveFooterPhoneLinks('', '04261234567')).toHaveLength(1);
    expect(resolveFooterPhoneLinks('', '')).toHaveLength(0);
  });
});
