/**
 * barcode-code128.ts
 * Generador de códigos de barras Code128 (subconjunto B) en módulos vectoriales,
 * para imprimir etiquetas de envío escaneables sin dependencias externas.
 *
 * Devuelve las barras como rectángulos {x, width} listos para renderizar en un
 * <svg> de React. Code128B cubre ASCII 32–126 (dígitos, letras, símbolos).
 */

// Tabla estándar Code128: índice = valor del símbolo (0–106). Cada patrón son
// 6 anchos de módulo (barra, espacio, barra, …) salvo el STOP (índice 106).
const PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

export interface BarcodeBar {
  x: number;
  width: number;
}

export interface Barcode {
  bars: BarcodeBar[];
  width: number;
  height: number;
}

/** Convierte el texto a la secuencia de códigos Code128B con checksum y stop. */
function encodeCode128B(data: string): number[] {
  const codes: number[] = [START_B];
  let sum = START_B;
  let position = 1;

  for (const ch of data) {
    const value = ch.charCodeAt(0) - 32;
    if (value < 0 || value > 94) {
      // Carácter fuera de Code128B: lo sustituimos por un espacio para no romper.
      codes.push(0);
      sum += 0 * position;
    } else {
      codes.push(value);
      sum += value * position;
    }
    position++;
  }

  codes.push(sum % 103);
  codes.push(STOP);
  return codes;
}

/**
 * Genera las barras de un Code128B.
 * @param data       Texto a codificar (ASCII 32–126).
 * @param moduleWidth Ancho de un módulo en px (default 2).
 * @param height      Alto del código en px (default 60).
 * @param quietZone   Módulos de margen a cada lado (default 10).
 */
export function code128(
  data: string,
  { moduleWidth = 2, height = 60, quietZone = 10 }: { moduleWidth?: number; height?: number; quietZone?: number } = {},
): Barcode {
  const codes = encodeCode128B(data);
  const bars: BarcodeBar[] = [];
  let x = quietZone * moduleWidth;

  for (const code of codes) {
    const pattern = PATTERNS[code];
    for (let i = 0; i < pattern.length; i++) {
      const w = parseInt(pattern[i], 10) * moduleWidth;
      // Posiciones pares (0,2,4,…) son barras; impares son espacios.
      if (i % 2 === 0) bars.push({ x, width: w });
      x += w;
    }
  }

  const width = x + quietZone * moduleWidth;
  return { bars, width, height };
}
