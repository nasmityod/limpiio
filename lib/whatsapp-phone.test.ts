import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppPhone, isValidWhatsAppPhone } from './whatsapp-phone';

describe('whatsapp-phone', () => {
  describe('normalizeWhatsAppPhone', () => {
    it('normaliza formatos locales y con separadores', () => {
      expect(normalizeWhatsAppPhone('04261234567')).toBe('584261234567');
      expect(normalizeWhatsAppPhone('0426-1234567')).toBe('584261234567');
      expect(normalizeWhatsAppPhone('4261234567')).toBe('584261234567');
      expect(normalizeWhatsAppPhone('+58 426-1234567')).toBe('584261234567');
      expect(normalizeWhatsAppPhone('0058 426 1234567')).toBe('584261234567');
      expect(normalizeWhatsAppPhone('584121234567')).toBe('584121234567');
    });

    it('normaliza todos los prefijos móviles venezolanos', () => {
      const prefixes = ['412', '414', '416', '424', '426'] as const;
      for (const prefix of prefixes) {
        expect(normalizeWhatsAppPhone(`0${prefix}1234567`)).toBe(`58${prefix}1234567`);
        expect(normalizeWhatsAppPhone(`${prefix}1234567`)).toBe(`58${prefix}1234567`);
        expect(normalizeWhatsAppPhone(`58${prefix}1234567`)).toBe(`58${prefix}1234567`);
      }
    });

    it('no agrega el código de país dos veces', () => {
      expect(normalizeWhatsAppPhone('584261234567')).toBe('584261234567');
      expect(normalizeWhatsAppPhone('+58 426 1234567')).toBe('584261234567');
      expect(normalizeWhatsAppPhone('0058 426 1234567')).toBe('584261234567');
    });

    it('no convierte teléfonos fijos ni números inválidos a E.164', () => {
      expect(normalizeWhatsAppPhone('02511234567')).toBe('02511234567');
      expect(normalizeWhatsAppPhone('02121234567')).toBe('02121234567');
      expect(normalizeWhatsAppPhone('0426123')).toBe('0426123');
      expect(normalizeWhatsAppPhone('58426123456789')).toBe('58426123456789');
      expect(normalizeWhatsAppPhone('14155551234')).toBe('14155551234');
      expect(normalizeWhatsAppPhone('')).toBe('');
    });
  });

  describe('isValidWhatsAppPhone', () => {
    it('acepta móviles venezolanos en E.164', () => {
      expect(isValidWhatsAppPhone('584261234567')).toBe(true);
      expect(isValidWhatsAppPhone('04261234567')).toBe(true);
      expect(isValidWhatsAppPhone('+58 412-1234567')).toBe(true);
    });

    it('rechaza fijos, incompletos, extranjeros y vacío', () => {
      expect(isValidWhatsAppPhone('02511234567')).toBe(false);
      expect(isValidWhatsAppPhone('02121234567')).toBe(false);
      expect(isValidWhatsAppPhone('0426123')).toBe(false);
      expect(isValidWhatsAppPhone('58426123456789')).toBe(false);
      expect(isValidWhatsAppPhone('14155551234')).toBe(false);
      expect(isValidWhatsAppPhone('')).toBe(false);
    });
  });
});
