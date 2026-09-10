/**
 * Google Product Taxonomy ID mapper for the MundoTech Merchant Center feed.
 *
 * Maps internal category names (stored in Product.category / Category.name)
 * to Google Product Taxonomy numeric IDs. Numeric IDs are preferred over text
 * strings because they are locale-independent and stable across taxonomy updates.
 *
 * Reference (official list):
 * https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
 * (version 2021-09-21 — verified Jun 2026)
 *
 * HOW THE LOOKUP WORKS
 * ─────────────────────
 * 1. Normalize the incoming name: lowercase, strip diacritics, collapse spaces.
 * 2. Exact match on the full normalized string in CATEGORY_MAP.
 * 3. Whole-word token match: split normalized name into tokens, check if any
 *    token equals a key in CATEGORY_MAP (prevents false positives like
 *    "red" matching "Redragon" or "switch" matching "Nintendo Switch" → Networking).
 * 4. Fallback → GOOGLE_CATEGORY_FALLBACK (222 = Electronics).
 *
 * ADDING NEW CATEGORIES
 * ──────────────────────
 * Add an entry with the normalized name (lowercase, no accents) as key and the
 * verified Google Taxonomy numeric ID as value. Multiple aliases may share the
 * same ID.
 *
 * OVERRIDE PER CATEGORY
 * ──────────────────────
 * The Category model has a `googleCategoryId Int?` field. When set by an admin,
 * it takes priority over this map. This map is the seed/fallback only.
 */

/** Top-level Electronics ID — fallback for unmapped / unknown categories. */
export const GOOGLE_CATEGORY_FALLBACK = 222; // Electronics

/**
 * Normalized category name fragment → Google Product Taxonomy numeric ID.
 *
 * IDs verified against the official Google taxonomy (en-US, v2021-09-21).
 */
const CATEGORY_MAP: Record<string, number> = {
  // ── Categorías de tienda (nombre exacto normalizado) ───────────────────────
  // IDs oficiales: taxonomy-with-ids.en-US.txt (2021-09-21)
  'belleza':            2915, // Health & Beauty > Personal Care
  'salud':               491, // Health & Beauty > Health Care
  'automotriz':          888, // Vehicles & Parts
  'sonido':              223, // Electronics > Audio
  'hogar':               536, // Home & Garden
  'equipo de oficina':   922, // Office Supplies
  'accesorios':         2082, // Electronics > Electronics Accessories
  'computacion':         278, // Electronics > Computers
  'herramientas':       1167, // Hardware > Tools
  'deportivo':           988, // Sporting Goods
  'seguridad':           359, // Home & Garden > Business & Home Security
  'mascotas':              2, // Animals & Pet Supplies > Pet Supplies

  // ── Telefonía ──────────────────────────────────────────────────────────────
  // Electronics > Communications > Telephony > Mobile Phones (267)
  'celular':        267,
  'celulares':      267,
  'smartphone':     267,
  'smartphones':    267,
  'telefono':       267,
  'telefonos':      267,
  'movil':          267,
  'moviles':        267,

  // ── Computación portátil ──────────────────────────────────────────────────
  // Electronics > Computers > Laptops (328)
  'laptop':         328,
  'laptops':        328,
  'portatil':       328,
  'portatiles':     328,
  'notebook':       328,
  'notebooks':      328,

  // ── Computación de escritorio ─────────────────────────────────────────────
  // Electronics > Computers > Desktop Computers (325)  ← was 298 (wrong)
  'computadora':    325,
  'computadoras':   325,
  'desktop':        325,
  'desktops':       325,
  'computador':     325,
  'pc escritorio':  325,

  // ── Tablets ───────────────────────────────────────────────────────────────
  // Electronics > Computers > Tablet Computers (4745)
  'tablet':         4745,
  'tablets':        4745,

  // ── Gaming / Consolas ─────────────────────────────────────────────────────
  // Electronics > Video Game Consoles & Accessories > Video Game Consoles (1294)
  'consola':        1294,
  'consolas':       1294,
  'gaming':         1294,
  'videojuego':     1294,
  'videojuegos':    1294,
  'video juego':    1294,

  // ── Audífonos / Auriculares ───────────────────────────────────────────────
  // Electronics > Audio > Headphones & Headsets (505771)  ← was 379 (wrong)
  'audifono':       505771,
  'audifonos':      505771,
  'auricular':      505771,
  'auriculares':    505771,
  'headphone':      505771,
  'headset':        505771,

  // ── Parlantes / Bocinas ───────────────────────────────────────────────────
  // Electronics > Audio > Speakers (249)  ← was 2036 (wrong)
  'parlante':       249,
  'parlantes':      249,
  'bocina':         249,
  'bocinas':        249,
  'altavoz':        249,
  'altavoces':      249,
  'speaker':        249,

  // ── Televisores ───────────────────────────────────────────────────────────
  // Electronics > Video > Televisions (404)
  'televisor':      404,
  'televisores':    404,
  'television':     404,
  'televisiones':   404,

  // ── Monitores ─────────────────────────────────────────────────────────────
  // Electronics > Computers > Computer Monitors (305)  ← was 297 (wrong)
  'monitor':        305,
  'monitores':      305,

  // ── Redes / Conectividad ──────────────────────────────────────────────────
  // Electronics > Networking (342)
  // NOTE: 'switch' and 'red' are intentionally omitted as standalone keys to
  // prevent false positives ("Nintendo Switch", "Redragon"). Use full-name
  // entries instead.
  'router':         342,
  'routers':        342,
  'networking':     342,
  'modem':          342,

  // ── Impresoras ────────────────────────────────────────────────────────────
  // Office Supplies > Print, Copy, Scan & Fax > Printers, Copiers & Fax (500106)
  // ← was 303 (wrong)
  'impresora':      500106,
  'impresoras':     500106,

  // ── Cámaras ───────────────────────────────────────────────────────────────
  // Cameras & Optics > Cameras (142)  ← was 149 (wrong)
  'camara':         142,
  'camaras':        142,
  'camara web':     142,
  'webcam':         142,
};

/**
 * Normalize a category name for map lookup.
 * Lowercases, strips Unicode diacritics, replaces non-alphanumeric runs
 * with a single space, then trims.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns the Google Product Taxonomy numeric ID for the given internal
 * category name.  Falls back to GOOGLE_CATEGORY_FALLBACK (222 = Electronics)
 * when no mapping is found so the feed never produces an empty/invalid value.
 *
 * Lookup order:
 * 1. Exact match on the full normalized string.
 * 2. Whole-word token match (avoids "red"→"Redragon", "switch"→"Nintendo Switch").
 * 3. Fallback → 222.
 *
 * @example
 *   getGoogleCategoryId('Celulares')  // → 267
 *   getGoogleCategoryId('Consolas')   // → 1294
 *   getGoogleCategoryId('Regalos')    // → 222 (fallback)
 *   getGoogleCategoryId(null)         // → 222 (fallback)
 */
export function getGoogleCategoryId(categoryName: string | null | undefined): number {
  if (!categoryName) return GOOGLE_CATEGORY_FALLBACK;

  const normalized = normalize(categoryName);

  // 1. Exact match on full normalized name
  if (CATEGORY_MAP[normalized] !== undefined) return CATEGORY_MAP[normalized]!;

  // 2. Whole-word token match: each space-separated token of the normalized
  //    name is tested as an exact key in CATEGORY_MAP. This prevents substring
  //    false positives (e.g. "Redragon" would only match if "redragon" is a key,
  //    not because it contains "red"; "Nintendo Switch" would only match if
  //    "nintendo" or "switch" are keys — and "switch" has been removed).
  const tokens = normalized.split(' ');
  for (const token of tokens) {
    if (CATEGORY_MAP[token] !== undefined) return CATEGORY_MAP[token]!;
  }

  // 3. Fallback
  return GOOGLE_CATEGORY_FALLBACK;
}
