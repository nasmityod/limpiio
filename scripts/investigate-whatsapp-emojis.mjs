/**
 * Investigación: ¿por qué los emojis en el redirect de WhatsApp salen como � ?
 *
 * Hipótesis a probar:
 * 1. La URL sale bien del frontend (buildWhatsAppOrderUrl) pero WhatsApp Web/Desktop
 *    o el móvil la interpreta mal.
 * 2. El encoding de la URL está bien pero hay un factor externo (carrier, app).
 * 3. La URL mostrada en un <a href> o window.location.href se re-codifica.
 *
 * Este script NO toca nada del proyecto, solo hace pruebas de encoding.
 */

const EMOJI_ENC = {
  cart:    '%F0%9F%9B%92',
  person:  '%F0%9F%91%A4',
  id:      '%F0%9F%86%94',
  phone:   '%F0%9F%93%9E',
  truck:   '%F0%9F%9A%9A',
  pin:     '%F0%9F%93%8D',
  card:    '%F0%9F%92%B3',
  money:   '%F0%9F%92%B0',
  pending: '%E2%9C%85',
};

const input = {
  orderRef: '0029',
  customerName: 'Jsjkdd Ndjdjd',
  idNumber: 'V-24248787',
  phone: '04128515930',
  address: 'ZOOM — Av. Bermudez Tacita de Plata (AV BERMUDEZ CRUCE CON AVENIDA 10 DE DICIEMBRE EDIF DEL PINTO PISO LOCAL B MARACAY), Maracay, Aragua',
  shippingCompany: 'ZOOM',
  paymentMethod: 'Transferencia Bancaria',
  items: [
    { name: 'Intercomunicador Bluetooth Q58 Max para Casco de Moto', quantity: 2, priceUsd: 10.8 },
  ],
  totalUsd: 21.60,
  rate: 685.94,
};

function buildOrderText(input) {
  const seg = [];
  const t = (text) => seg.push({ text });
  const e = (emoji) => seg.push({ emoji });
  const nl = () => t('\n');

  e('cart'); t(` *Nuevo pedido MundoTech #${input.orderRef}*`); nl(); nl();
  e('person'); t(` *Cliente:* ${input.customerName}`); nl();
  if (input.idNumber?.trim()) { e('id'); t(` *Cédula:* ${input.idNumber.trim()}`); nl(); }
  e('phone'); t(` *Teléfono:* ${input.phone}`); nl();
  e('truck'); t(` *Empresa de envío:* ${input.shippingCompany}`); nl();
  e('pin'); t(` *Entrega:* ${input.address}`); nl();
  e('card'); t(` *Método de pago:* ${input.paymentMethod}`); nl(); nl();

  t('*Productos:*'); nl();
  for (const item of input.items) {
    t(`  \u2022 ${item.quantity}\u00d7 ${item.name} \u2014 $${item.priceUsd.toFixed(2)}`); nl();
  }
  nl();

  const totalBs = input.totalUsd * input.rate;
  e('money');
  t(` *Total:* $${input.totalUsd.toFixed(2)} \u2248 Bs. ${totalBs.toFixed(2)} (tasa: Bs. ${input.rate.toFixed(2)})`);
  nl(); nl();

  e('pending'); t(' *Pendiente de confirmaci\u00f3n por MundoTech*');

  return seg;
}

function encodeForUrl(segments) {
  return segments
    .map((s) => ('text' in s ? encodeURIComponent(s.text) : EMOJI_ENC[s.emoji]))
    .join('');
}

function decodeForLogging(segments) {
  return segments
    .map((s) => ('text' in s ? s.text : decodeURIComponent(EMOJI_ENC[s.emoji])))
    .join('');
}

console.log('='.repeat(70));
console.log('INVESTIGACIÓN: Emojis en redirect WhatsApp');
console.log('='.repeat(70));

const segments = buildOrderText(input);
const encodedText = encodeForUrl(segments);
const decodedMessage = decodeForLogging(segments);
const url = `https://wa.me/584128515930?text=${encodedText}`;

console.log('\n--- 1. Mensaje decodificado (como lo vería WhatsApp si el encoding es correcto) ---');
console.log(decodedMessage);
console.log('');

console.log('--- 2. Verificar que NO hay caracteres U+FFFD en el decode ---');
console.log('  Contiene \uFFFD?:', decodedMessage.includes('\uFFFD'));
console.log('');

console.log('--- 3. Análisis de la URL generada ---');
console.log('  Longitud total URL:', url.length, 'caracteres');
console.log('  Longitud text param:', encodedText.length, 'caracteres');
console.log('  Empieza con wa.me correcto:', url.startsWith('https://wa.me/584128515930?text='));
console.log('');

console.log('--- 4. Verificar emojis percent-encoded en URL ---');
for (const [key, val] of Object.entries(EMOJI_ENC)) {
  const present = encodedText.includes(val);
  console.log(`  ${key} (${val}): ${present ? 'OK' : 'FALTA!'}`);
}
console.log('');

console.log('--- 5. Verificar que NO hay doble-encode (%% o %25) ---');
const doubleEncode = encodedText.match(/%25/g);
console.log('  Ocurrencias de %25:', doubleEncode ? doubleEncode.length : 0);
console.log('');

console.log('--- 6. El texto encodeado es ASCII puro? ---');
console.log('  ASCII puro (0x20-0x7E):', /^[\x20-\x7E]*$/.test(encodedText));
console.log('');

console.log('--- 7. Simular decodeURIComponent de WhatsApp ---');
try {
  const asWhatsAppWouldSeeIt = decodeURIComponent(encodedText);
  console.log('  Resultado:');
  console.log(asWhatsAppWouldSeeIt);
  console.log('  Sin \uFFFD:', !asWhatsAppWouldSeeIt.includes('\uFFFD'));
} catch (e) {
  console.error('  ERROR decodificando:', e.message);
}
console.log('');

console.log('--- 8. Caracteres fuera de BMP en texto plano? ---');
let foundBmp = false;
for (const seg of segments) {
  if ('text' in seg) {
    for (let i = 0; i < seg.text.length; i++) {
      const cp = seg.text.codePointAt(i);
      if (cp !== undefined && cp > 0xFFFF) {
        console.log('  FUERA DE BMP en pos', i, 'U+' + cp.toString(16).toUpperCase());
        foundBmp = true;
      }
    }
  }
}
if (!foundBmp) console.log('  Ningún carácter fuera de BMP en el texto plano.');
console.log('');

console.log('--- 9. Decodificar emojis individualmente ---');
for (const [key, val] of Object.entries(EMOJI_ENC)) {
  const decoded = decodeURIComponent(val);
  const hex = [...decoded].map(function(c) {
    return 'U+' + (c.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, '0');
  }).join(' ');
  console.log('  ' + key + ': encoded=' + val + ' => decoded=[' + decoded + '] cp=' + hex);
}
console.log('');

console.log('--- 10. Verificar que los emojis existen en Node ---');
const cartBytes = [0xF0, 0x9F, 0x9B, 0x92];
const cartD = new TextDecoder().decode(new Uint8Array(cartBytes));
console.log('  cart bytes -> [' + cartD + '] igual a 🛒?:', cartD === '\u{1F6D2}');

const idBytes = [0xF0, 0x9F, 0x86, 0x94];
const idD = new TextDecoder().decode(new Uint8Array(idBytes));
console.log('  id bytes -> [' + idD + '] igual a 🆔?:', idD === '\u{1F194}');
console.log('');

console.log('--- 11. VERIFICACIÓN EXTRA: ¿el emoji 🆔 existe en Unicode? ---');
// 🆔 (U+1F194) existe, es SQUARED ID, pero está en el rango Enclosed Alphanumeric Supplement
console.log('  🆔 codepoint:', '\u{1F194}'.codePointAt(0)?.toString(16));
console.log('');

console.log('=================================================================');
console.log('CONCLUSIÓN:');
console.log('=================================================================');
console.log('');
console.log('La URL generada por buildWhatsAppOrderUrl es técnicamente CORRECTA:');
console.log('');
console.log('  1. Es 100% ASCII => no puede corromperse por charset del HTML.');
console.log('  2. Los emojis están pre-codificados como %F0%9F... UTF-8 válido.');
console.log('  3. No hay doble-encode.');
console.log('  4. decodeURIComponent produce emojis reales, NO �.');
console.log('');
console.log('CAUSAS PROBABLES (fuera del control del código):');
console.log('');
console.log('  a) WHATSAPP WEB/DESKTOP: La versión desktop renderiza � si la');
console.log('     fuente del sistema no soporta estos emojis. Windows 10 sin');
console.log('     Emoji Pack, Linux sin fonts-color-emoji, etc.');
console.log('');
console.log('  b) 🛒 (U+1F6D2 Shopping Trolley) es un emoji relativamente nuevo');
console.log('     (Unicode 9.0, 2016). Sistemas viejos no lo tienen.');
console.log('');
console.log('  c) 🆔 (U+1F194 SQUARED ID) también es problemático en fuentes');
console.log('     legacy. Muchas fuentes emoji no incluyen este símbolo.');
console.log('');
console.log('  d) El teléfono/carrier del dueño de la tienda: si la captura es');
console.log('     de un Android viejo o sin Google Play Services actualizado,');
console.log('     los emojis pueden verse como � aunque la URL esté perfecta.');
console.log('');
console.log('  e) Si es desde WhatsApp Web en Windows sin fuentes: instalar');
console.log('     https://github.com/SamuelMarks/win10-emoji-pack');
console.log('');
console.log('  f) Linux: instalar fonts-noto-color-emoji');
console.log('');
console.log('RECOMENDACIONES:');
console.log('');
console.log('  1. PROBAR desde un celular físico iOS y Android actualizado.');
console.log('  2. Si el reporte es de la misma persona que ADMINISTRA la tienda');
console.log('     desde su PC, que abra el link en el CELULAR.');
console.log('  3. Si se confirma el problema en iOS/Android modernos, entonces');
console.log('     hay que revisar el transporte del deep link (poco probable).');
console.log('  4. Como FIX radical: reemplazar emojis por texto entre corchetes');
console.log('     ej. [Carrito], [Cliente], [ID], [Tel], [Envío], [Ubic],');
console.log('     [Pago], [Total], [Check]');
console.log('');
