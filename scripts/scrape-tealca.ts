/**
 * Script de scraping completo de oficinas Tealca.
 * 1. Descubre estados desde el index de https://www.tealca.com/oficinas/
 * 2. Para cada estado, recorre su índice y recolecta URLs de oficinas
 * 3. Entra a CADA página de detalle y extrae: name, code, city, address, email, instagram
 * 4. Genera lib/tealca-offices.ts con la misma estructura que lib/zoom-offices.ts
 *
 * Uso: npx tsx scripts/scrape-tealca.ts
 */
import { writeFileSync } from 'fs';
import * as cheerio from 'cheerio';

const BASE = 'https://www.tealca.com';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

/**
 * Mapa de slugs de estado Tealca a las llaves canónicas usadas por
 * lib/mrw-offices.ts y lib/zoom-offices.ts.
 */
const STATE_SLUG_TO_KEY: Record<string, string> = {
  anzoategui: 'Anzoátegui',
  apure: 'Apure',
  aragua: 'Aragua',
  barinas: 'Barinas',
  bolivar: 'Bolívar',
  carabobo: 'Carabobo',
  cojedes: 'Cojedes',
  'd-capital': 'Distrito Capital',
  'delta-amacuro': 'Delta Amacuro',
  falcon: 'Falcón',
  guarico: 'Guárico',
  lara: 'Lara',
  merida: 'Mérida',
  miranda: 'Miranda',
  monagas: 'Monagas',
  'nueva-esparta': 'Nueva Esparta',
  portuguesa: 'Portuguesa',
  sucre: 'Sucre',
  tachira: 'Táchira',
  trujillo: 'Trujillo',
  vargas: 'La Guaira',
  yaracuy: 'Yaracuy',
  zulia: 'Zulia',
};

/** Manual mapping of known office slug → state slug for offices whose URL
 *  parent segment is NOT the canonical state slug.
 *  Discovered by inspecting each state index page. */
const OFFICE_PARENT_TO_STATE: Record<string, string> = {
  // Anzoátegui
  anaco: 'anzoategui',
  // Falcón
  coro: 'falcon',
  // Guárico
  calabozo: 'guarico',
  // Lara
  barquisimeto: 'lara',
  cabudare: 'lara',
  carora: 'lara',
  eltocuyo: 'lara',
  // Mérida
  cajaseca: 'merida',
  'el-vigia': 'merida',
  // Miranda
  charallave: 'miranda',
  guarenas: 'miranda',
  guatire: 'miranda',
  higuerote: 'miranda',
  'los-teques': 'miranda',
  // Monagas
  maturin: 'monagas',
  // Nueva Esparta
  laasuncion: 'nueva-esparta',
  'juan-griego': 'nueva-esparta',
  losrobles: 'nueva-esparta',
  // Portuguesa
  acarigua: 'portuguesa',
  guanare: 'portuguesa',
  // Sucre
  carupano: 'sucre',
  cumana: 'sucre',
  // Táchira
  capacho: 'tachira',
  'la-fria': 'tachira',
  lagrita: 'tachira',
  'san-cristobal': 'tachira',
  'san-antonio-del-tach': 'tachira',
  // Vargas / La Guaira
  caraballeda: 'vargas',
  maiquetia: 'vargas',
  // Yaracuy
  'san-felipe': 'yaracuy',
  // Zulia
  cabimas: 'zulia',
  'ciudad-ojeda': 'zulia',
  maracaibo: 'zulia',
  'villa-del-rosario': 'zulia',
};

export interface TealcaOffice {
  name: string;
  code: string;
  city: string;
  address: string;
}

function sleep(ms = 400): Promise<void> {
  const jitter = Math.random() * 200;
  return new Promise((r) => setTimeout(r, ms + jitter));
}

/** Fetch HTML con reintentos */
async function fetchHtml(url: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt < retries) {
        console.warn(`  ⚠️  Reintento ${attempt}/${retries} para ${url}: ${err}`);
        await sleep(1000 * attempt);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Fallaron ${retries} intentos para ${url}`);
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#\d+;/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\u00A0/g, ' ')
    .trim();
}

/** Valida que un texto sea un código Tealca real:
 *  - No vacío
 *  - No contiene "Detalles", "Contacto", "Código" ni otros encabezados
 *  - Es alfanumérico corto (máx 6 caracteres), opcionalmente con un sufijo
 *    tipo "B", "C", etc. Ej: 2901, J7917, 8511B, 3208B, 5113B, CC, DD
 */
function isValidTealcaCode(val: string): boolean {
  if (!val) return false;
  if (val.includes('Detalles') || val.includes('Contacto') || val.includes('Código') || val.includes('Ciudad')) return false;
  if (val.length > 8) return false; // codes are short
  // Must match pattern: optional letter prefix, digits, optional single letter suffix
  // e.g. 2901, J2911, 8511B, CC, DD, GG, RR, AA
  return /^[A-Za-z]?\d{1,4}[A-Za-z]?$|^[A-Za-z]{2}$/.test(val);
}

/** Descubre los slugs de estado desde el HTML del index */
async function discoverStates(): Promise<string[]> {
  console.log('🔍 Descubriendo estados desde /oficinas/...');
  const html = await fetchHtml(`${BASE}/oficinas/`);
  const $ = cheerio.load(html);

  const slugs = new Set<string>();
  // Option 1: extract from <option> values in the select
  $('select[name], select#estado, select').find('option').each((_, el) => {
    const val = $(el).attr('value') || '';
    if (!val || val === '' || val === 'Seleccione un estado') return;
    // The option values could be state names; try to match known slugs
    const lower = val.toLowerCase()
      .replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (STATE_SLUG_TO_KEY[lower]) slugs.add(lower);
  });

  // Option 2: extract from links to /oficinas/{slug}/
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/oficinas\/([a-z][a-z0-9-]*)\/?$/);
    if (match && STATE_SLUG_TO_KEY[match[1]]) {
      slugs.add(match[1]);
    }
  });

  // Remove d-capital since it's handled by Distrito Capital in tealca site
  if (slugs.has('distrito-capital')) {
    slugs.delete('distrito-capital');
    slugs.add('d-capital');
  }

  const sortedSlugs = [...slugs].sort();
  if (sortedSlugs.length === 0) {
    // Fallback: use all known
    return Object.keys(STATE_SLUG_TO_KEY).sort();
  }
  console.log(`  → ${sortedSlugs.length} estados encontrados: ${sortedSlugs.join(', ')}`);
  return sortedSlugs;
}

/** Extrae TODAS las URLs de oficina desde un índice de estado.
 *  Cada oficina en el índice aparece como un link con href /oficinas/{parent}/{slug}/
 */
async function fetchOfficeUrls(stateSlug: string): Promise<string[]> {
  const url = `${BASE}/oficinas/${stateSlug}/`;
  console.log(`  📋 Índice: ${stateSlug} (${url})`);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const urls = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    // Match /oficinas/{segment1}/{segment2}/ URL pattern
    const match = href.match(/https?:\/\/www\.tealca\.com\/oficinas\/([^/]+)\/([^/]+)\/?$/);
    if (match) {
      urls.add(href.replace(/\/$/, ''));
      return;
    }
    // Also match relative paths
    const relMatch = href.match(/^\/oficinas\/([^/]+)\/([^/]+)\/?$/);
    if (relMatch) {
      urls.add(`${BASE}${href.replace(/\/$/, '')}`);
    }
  });

  const urlList = [...urls];
  console.log(`    → ${urlList.length} URLs de oficina encontradas`);
  return urlList;
}

/** Dado un segmento de URL (primer segmento tras /oficinas/), determina
 *  el slug de estado canónico. */
function resolveStateSlug(firstSlug: string): string | null {
  if (STATE_SLUG_TO_KEY[firstSlug]) return firstSlug;
  if (OFFICE_PARENT_TO_STATE[firstSlug]) return OFFICE_PARENT_TO_STATE[firstSlug];
  return null;
}

/** Extract text that follows a label (e.g. "Código:") inside a specific section.
 *  The detail page has a "Detalles de Contacto:" section with label-value pairs.
 */
function extractLabelValue($: cheerio.CheerioAPI, labelText: string): string {
  // Look for text nodes containing the label, then get the following text
  // Strategy: find elements whose text starts with or contains the label
  const bodyHtml = $.html() || '';

  // Simple regex on body text won't work because script tags contaminate it.
  // Instead, search within the main content area.

  // Try to find the label in the contact details section
  // The HTML pattern is usually:
  // <strong or label>Dirección:</strong> <text or div>
  // or plain text "Código:" followed by the value

  // Use a regex that looks for the label after a > tag boundary to avoid script content
  const escapedLabel = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `${escapedLabel}[^<]*<\\/(?:strong|label|span)>\\s*([^<]+(?:<(?:br|span|div)[^>]*>[^<]*)*)`,
    'i'
  );
  const m = bodyHtml.match(pattern);
  if (m) {
    const val = cleanText(m[1].replace(/<[^>]+>/g, ' '));
    if (val && val !== '' && !val.includes('Detalles de Contacto') && val.length < 200) {
      return val;
    }
  }

  // Fallback: look for label: value pattern
  const pattern2 = new RegExp(`${escapedLabel}\\s*[:\\s]*([^<\\n]+)`, 'i');
  // Must be outside script/style tags - use a different approach
  // Find all non-script text nodes
  const allTexts: string[] = [];
  $('body *:not(script):not(style):not(noscript)').contents().each((_, el) => {
    if (el.type === 'text') {
      allTexts.push($(el).text());
    }
  });
  const visibleText = allTexts.join(' ');

  const m2 = visibleText.match(new RegExp(`${escapedLabel}\\s*[:\\s]*([^\\n]+)`, 'i'));
  if (m2) {
    return cleanText(m2[1]);
  }

  return '';
}

/** Extrae datos de la página de detalle de una oficina.
 *  Usa el HTML real parseado con cheerio, evitando contenido de <script> y <style>. */
async function fetchOfficeDetail(url: string): Promise<{
  name: string;
  code: string;
  city: string;
  address: string;
  email: string;
  instagram: string;
}> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // 1. Name: <h1> text
  const name = cleanText($('h1').first().text());

  // 2. Code, City, Address: extract from the non-script visible text
  // Remove script, style, noscript elements before extracting text
  const $body = $('body').clone();
  $body.find('script, style, noscript, iframe, svg, form').remove();

  const visibleBodyHtml = $body.html() || '';

  // Code: look for "Código:" label followed by a value
  // The code follows a <div class="text-dec city-code"> after "Código:"
  let code = '';
  $('div.city-code, div.text-dec').each((_, el) => {
    const txt = $(el).text().trim();
    const m = txt.match(/C[oó]digo:\s*(.+)/i);
    if (m) {
      const val = cleanText(m[1]);
      if (isValidTealcaCode(val)) {
        code = val;
      }
    }
  });
  // Fallback: regex on visible HTML
  if (!code) {
    const codeMatch = visibleBodyHtml.match(
      /C[oó]digo:\s*(?:\s*<[^>]+>\s*)*([A-Za-z0-9][A-Za-z0-9.\-\s]{0,28})/i
    );
    if (codeMatch) {
      const val = cleanText(codeMatch[1]);
      if (isValidTealcaCode(val)) {
        code = val;
      }
    }
  }

  // City: look for "Ciudad:" label
  let city = '';
  $('div.city-name, div.text-dec').each((_, el) => {
    const txt = $(el).text().trim();
    const m = txt.match(/Ciudad:\s*(.+)/i);
    if (m) {
      const val = cleanText(m[1]);
      if (val && val !== '' && val.length < 60 && !val.includes('Código')) {
        city = val;
      }
    }
  });
  // Fallback
  if (!city) {
    const cityMatch = visibleBodyHtml.match(
      /Ciudad:\s*(?:\s*<[^>]+>\s*)*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]{1,50})/i
    );
    if (cityMatch) {
      const val = cleanText(cityMatch[1]);
      if (val && val.length < 60 && !val.includes('Código') && !val.includes('Detalles')) {
        city = val;
      }
    }
  }

  // Address: find <div class="col-md-8 col-sm-6 text-dec"> and extract its text
  let address = '';
  $('div.col-md-8.col-sm-6.text-dec').each((_, el) => {
    const txt = cleanText($(el).text());
    if (txt && txt.length > address.length) address = txt;
  });

  // Fallback: find address after "Dirección:" label in visible HTML
  if (!address) {
    const addrMatch = visibleBodyHtml.match(
      /Direcci[oó]n:\s*(?:\s*<[^>]+>\s*)*([^<]+(?:\s*<br\s*\/?>\s*[^<]*)*)/i
    );
    if (addrMatch) {
      address = cleanText(addrMatch[1]);
    }
  }

  // Fallback from text-dec - sometimes the address is just text after "Dirección:"
  if (!address) {
    const dirLabel = $body.find('strong, label, span, p').filter(function () {
      return /^Direcci[oó]n/i.test($(this).text().trim());
    }).first();
    if (dirLabel.length) {
      const parent = dirLabel.closest('div, p, section');
      address = cleanText(parent.contents().filter((_, el) => el.type === 'text').text());
      if (!address) {
        // Get all text after this element within the same container
        let nextSibling = dirLabel.parent().next();
        if (nextSibling.length) {
          address = cleanText(nextSibling.text());
        }
      }
    }
  }

  // Email: find first email pattern in visible content
  let email = '';
  const visibleText = $body.text();
  const emailMatch = visibleText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    email = emailMatch[0];
  }

  // Instagram: look for "Instagram:" followed by a value
  let instagram = '';
  const instaMatch = visibleBodyHtml.match(
    /Instagram:\s*(?:\s*<[^>]+>\s*)*([^<>\n]{1,60})/i
  );
  if (instaMatch) {
    const val = cleanText(instaMatch[1]);
    if (val && val !== '' && val !== 'NO APLICA') {
      instagram = val;
    }
  }

  return { name, code, city, address, email, instagram };
}

const MORE_STATE_SLUGS: Record<string, string> = {
  // Additional offices we know about from the list, mapped to their state
  'anzoategui': 'Anzoátegui',
  'apure': 'Apure',
  'aragua': 'Aragua',
  'barinas': 'Barinas',
  'bolivar': 'Bolívar',
  'carabobo': 'Carabobo',
  'cojedes': 'Cojedes',
  'd-capital': 'Distrito Capital',
  'delta-amacuro': 'Delta Amacuro',
  'falcon': 'Falcón',
  'guarico': 'Guárico',
  'lara': 'Lara',
  'merida': 'Mérida',
  'miranda': 'Miranda',
  'monagas': 'Monagas',
  'nueva-esparta': 'Nueva Esparta',
  'portuguesa': 'Portuguesa',
  'sucre': 'Sucre',
  'tachira': 'Táchira',
  'trujillo': 'Trujillo',
  'vargas': 'La Guaira',
  'yaracuy': 'Yaracuy',
  'zulia': 'Zulia',
};

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  Scraper de Oficinas Tealca');
  console.log('══════════════════════════════════════════════\n');

  // 1. Descubrir estados
  const stateSlugs = await discoverStates();

  // 2. Recolectar TODAS las URLs de oficina de todos los estados
  const allOfficeUrls: string[] = [];
  const stateOfficeCount: Record<string, number> = {};

  for (const slug of stateSlugs) {
    const urls = await fetchOfficeUrls(slug);
    for (const u of urls) {
      if (!allOfficeUrls.includes(u)) allOfficeUrls.push(u);
    }
    stateOfficeCount[slug] = (stateOfficeCount[slug] || 0) + urls.length;
    await sleep(300);
  }

  console.log(`\n📊 Total de URLs únicas de oficina recolectadas: ${allOfficeUrls.length}\n`);

  // 3. Visitar cada oficina y extraer datos
  const officesWithoutAddress: Array<{ name: string; url: string }> = [];
  // Map of stateKey -> TealcaOffice[]
  const grouped: Record<string, TealcaOffice[]> = {};

  for (let i = 0; i < allOfficeUrls.length; i++) {
    const url = allOfficeUrls[i];
    console.log(`  [${i + 1}/${allOfficeUrls.length}] ${url}`);
    try {
      const detail = await fetchOfficeDetail(url);

      // Determine state from URL
      const urlMatch = url.match(/\/oficinas\/([^/]+)\/([^/]+)/);
      const firstSlug = urlMatch ? urlMatch[1] : '';
      const stateSlug = resolveStateSlug(firstSlug);
      const stateKey = stateSlug ? (STATE_SLUG_TO_KEY[stateSlug] || stateSlug) : firstSlug;

      const office: TealcaOffice = {
        name: detail.name,
        code: detail.code,
        city: detail.city,
        address: detail.address,
      };

      if (!grouped[stateKey]) grouped[stateKey] = [];
      grouped[stateKey].push(office);

      if (!detail.address) {
        officesWithoutAddress.push({ name: detail.name, url });
        console.log(`    ✓ ${detail.name} | code: ${detail.code} | ciudad: ${detail.city} | ⚠️ ADDRESS VACÍA`);
      } else {
        console.log(`    ✓ ${detail.name} | code: ${detail.code} | ciudad: ${detail.city}`);
      }
    } catch (err) {
      console.error(`    ❌ Error fetching ${url}: ${err}`);
    }

    await sleep(400);
  }

  // Print offices without address
  console.log('\n══════════════════════════════════════════════');
  console.log('  OFICINAS SIN DIRECCIÓN');
  console.log('══════════════════════════════════════════════');
  if (officesWithoutAddress.length === 0) {
    console.log('  ✅ Todas las oficinas tienen dirección.');
  } else {
    for (const o of officesWithoutAddress) {
      console.log(`  ⚠️  ${o.name} — ${o.url}`);
    }
  }

  // 4. Generate TypeScript file
  // Sort state keys using a canonical order that matches mrwOffices
  const canonicalStateOrder = [
    'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar',
    'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón',
    'Guárico', 'La Guaira', 'Lara', 'Mérida', 'Miranda', 'Monagas',
    'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira', 'Trujillo',
    'Yaracuy', 'Zulia',
  ];

  // Merge any leftover unknown state keys
  const knownStates = grouped;
  const sortedStates = Object.keys(knownStates).sort((a, b) => {
    const ai = canonicalStateOrder.indexOf(a);
    const bi = canonicalStateOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const outputLines: string[] = [];
  outputLines.push('/**');
  outputLines.push(' * Lista blanca oficial de oficinas TEALCA por estado (paralela a lib/zoom-offices.ts).');
  outputLines.push(' * Fuente: scraping del directorio público de Tealca (tealca.com/oficinas/).');
  outputLines.push(' * Generado por scripts/scrape-tealca.ts.');
  outputLines.push(' */');
  outputLines.push('');
  outputLines.push('export interface TealcaOffice {');
  outputLines.push('  /** Nombre de la oficina Tealca. */');
  outputLines.push('  name: string;');
  outputLines.push('  /** Código interno de la oficina Tealca. */');
  outputLines.push('  code: string;');
  outputLines.push('  /** Ciudad donde se ubica la oficina. */');
  outputLines.push('  city: string;');
  outputLines.push('  /** Dirección completa. */');
  outputLines.push('  address: string;');
  outputLines.push('  /** URL de la página de la oficina en tealca.com. */');
  outputLines.push('  url: string;');
  outputLines.push('  /** Email de la oficina (opcional). */');
  outputLines.push('  email?: string;');
  outputLines.push('  /** Instagram de la oficina (opcional). */');
  outputLines.push('  instagram?: string;');
  outputLines.push('}');
  outputLines.push('');
  outputLines.push('export const tealcaOffices: Record<string, TealcaOffice[]> = {');

  for (const state of sortedStates) {
    const offices = knownStates[state].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    outputLines.push(`  "${state}": [`);

    for (const o of offices) {
      const fields: string[] = [];
      fields.push(`      name: ${JSON.stringify(o.name)}`);
      fields.push(`      code: ${JSON.stringify(o.code)}`);
      fields.push(`      city: ${JSON.stringify(o.city)}`);
      fields.push(`      address: ${JSON.stringify(o.address)}`);

      outputLines.push('    {');
      outputLines.push(fields.join(',\n'));
      outputLines.push('    },');
    }

    outputLines.push('  ],');
  }

  outputLines.push('};');
  outputLines.push('');
  outputLines.push('/**');
  outputLines.push(' * Índice de oficinas Tealca por nombre normalizado (para búsqueda O(1)).');
  outputLines.push(' */');
  outputLines.push('export const tealcaOfficeIndex: Record<string, TealcaOffice & { state: string }> = {};');
  outputLines.push('for (const [state, offices] of Object.entries(tealcaOffices)) {');
  outputLines.push('  for (const office of offices) {');
  outputLines.push('    const key = office.name.toLowerCase().replace(/[^a-z0-9]/g, "");');
  outputLines.push('    tealcaOfficeIndex[key] = { ...office, state };');
  outputLines.push('  }');
  outputLines.push('}');

  const content = outputLines.join('\n');
  const outPath = 'lib/tealca-offices.ts';
  writeFileSync(outPath, content, 'utf-8');
  console.log(`\n✅ Archivo generado: ${outPath}\n`);

  // 5. Summary
  let totalOffices = 0;
  console.log('══════════════════════════════════════════════');
  console.log('  📊 RESUMEN POR ESTADO');
  console.log('══════════════════════════════════════════════');
  for (const state of sortedStates) {
    const count = knownStates[state].length;
    totalOffices += count;
    console.log(`  ${state.padEnd(22)} ${count} oficinas`);
  }
  console.log('──────────────────────────────────────────────');
  console.log(`  TOTAL: ${totalOffices} oficinas en ${sortedStates.length} estados`);
  console.log(`  Oficinas sin dirección: ${officesWithoutAddress.length}`);
  if (officesWithoutAddress.length > 0) {
    for (const o of officesWithoutAddress) {
      console.log(`    ⚠️  ${o.name} — ${o.url}`);
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
