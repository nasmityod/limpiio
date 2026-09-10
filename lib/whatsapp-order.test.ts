import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppOrderText,
  buildWhatsAppOrderUrl,
  normalizeWaPhone,
  type WhatsAppOrderInput,
} from './whatsapp-order';

const sample: WhatsAppOrderInput = {
  orderRef: '0026',
  customerName: 'Hhhh Hjjj',
  idNumber: 'V-555',
  phone: '04128515930',
  address: 'Retiro en tienda',
  shippingCompany: 'Retiro en tienda',
  paymentMethod: 'Pago Móvil',
  items: [
    { name: 'Intercomunicador Bluetooth Q58 Max para Casco de Moto', quantity: 2, priceUsd: 10.8 },
  ],
  totalUsd: 21.6,
  rate: 685.94,
};

describe('whatsapp-order', () => {
  it('normaliza el teléfono', () => {
    expect(normalizeWaPhone('+58 412-147-1338')).toBe('584121471338');
    expect(normalizeWaPhone('04261234567')).toBe('584261234567');
    expect(normalizeWaPhone('')).toBe('');
  });

  it('el texto codificado es ASCII puro y contiene los emojis pre-encoded', () => {
    const text = buildWhatsAppOrderText(sample);

    // ASCII puro: ningún carácter fuera de 0x20-0x7E
    expect(/^[\x20-\x7E]*$/.test(text)).toBe(true);

    // Sin corrupción ni escape() legacy
    expect(text).not.toContain('�');
    expect(text).not.toContain('%u');

    // U+FFFD encodeado sería %EF%BF%BD: NO debe aparecer
    expect(text).not.toContain('%EF%BF%BD');

    // Emojis presentes como secuencias UTF-8 percent-encoded
    expect(text).toContain('%F0%9F%9B%92'); // 🛒
    expect(text).toContain('%F0%9F%91%A4'); // 👤
    expect(text).toContain('%F0%9F%93%9E'); // 📞
    expect(text).toContain('%F0%9F%92%B0'); // 💰
    expect(text).toContain('%E2%9C%85');    // ✅
  });

  it('al decodificar el texto vuelven los emojis reales, no �', () => {
    const decoded = decodeURIComponent(buildWhatsAppOrderText(sample));

    expect(decoded).toContain('🛒 *Nuevo pedido MundoTech #0026*');
    expect(decoded).toContain('👤 *Cliente:* Hhhh Hjjj');
    expect(decoded).toContain('🆔 *Cédula:* V-555');
    expect(decoded).toContain('📞 *Teléfono:* 04128515930');
    expect(decoded).toContain('  • 2× Intercomunicador Bluetooth Q58 Max para Casco de Moto — $10.80');
    expect(decoded).toContain('💰 *Total final:* $21.60 ≈ Bs. 14816.30 (tasa: Bs. 685.94)');
    expect(decoded).toContain('✅ *Pendiente de confirmación por MundoTech*');
    expect(decoded).not.toContain('�');
  });

  it('la URL final usa el número canónico E.164', () => {
    const url = buildWhatsAppOrderUrl('04261234567', sample);
    expect(url).toContain('phone=584261234567');
  });

  it('la URL final es api.whatsapp.com/send con text codificado y sin doble encode', () => {
    const url = buildWhatsAppOrderUrl('+58 412-147-1338', sample);

    expect(url.startsWith('https://api.whatsapp.com/send?phone=584121471338&text=')).toBe(true);
    expect(url).toContain('&text=');
    expect(url).toContain('%F0%9F%9B%92'); // 🛒 pre-encoded
    expect(url).not.toContain('�');
    expect(url).not.toContain('%EF%BF%BD');
    expect(url).not.toContain('%25'); // sin doble encode

    // El text del deep link vuelve a emojis reales
    const text = url.split('&text=')[1];
    expect(decodeURIComponent(text)).toContain('🛒 *Nuevo pedido MundoTech #0026*');
  });

  it('buildWhatsAppOrderMessage devuelve emojis reales para logging', () => {
    const msg = buildWhatsAppOrderMessage(sample);
    expect(msg).toContain('🛒');
    expect(msg).not.toContain('�');
  });

  it('lanza si no hay teléfono válido', () => {
    expect(() => buildWhatsAppOrderUrl('', sample)).toThrow('A valid WhatsApp order phone is required');
    expect(() => buildWhatsAppOrderUrl('02511234567', sample)).toThrow('A valid WhatsApp order phone is required');
  });

  it('incluye descuento por pago en divisas cuando viene del servidor', () => {
    const withDiscount: WhatsAppOrderInput = {
      ...sample,
      paymentMethod: 'Zelle',
      paymentCurrency: 'USD',
      paymentDiscountPercent: 10,
      paymentDiscountUsd: 2.16,
      totalUsd: 19.44,
    };
    const decoded = decodeURIComponent(buildWhatsAppOrderText(withDiscount));
    expect(decoded).toContain('*Método de pago:* Zelle');
    expect(decoded).toContain('*Moneda:* USD');
    expect(decoded).toContain('Descuento por pago en divisas (10%): -$2.16');
    expect(decoded).toContain('💰 *Total final:* $19.44');
  });
});
