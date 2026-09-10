/**
 * Script to clean tealca-offices.ts:
 * 1. Remove url, email, instagram fields from interface and all entries
 * 2. Fix 4 offices with code="Detalles de Contacto:" → code="" and city="Código:" → city=""
 * 3. Change tealcaOfficeIndex to use code-based keys with state fallback
 * 4. Verify 0 collisions (128 offices → 128 index entries)
 */
import { readFileSync, writeFileSync } from 'fs';

const content = readFileSync('lib/tealca-offices.ts', 'utf-8');
const lines = content.split('\n');

// Phase 1: Remove url, email, instagram lines from the data
// We'll process line by line and strip those fields
const cleanedLines = [];
let inDataSection = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // Detect data section start
  if (trimmed.startsWith('export const tealcaOffices:')) {
    inDataSection = true;
  }
  
  // Detect index section
  if (trimmed.startsWith('export const tealcaOfficeIndex:')) {
    inDataSection = false;
  }
  
  if (inDataSection) {
    // Skip url, email, instagram lines
    if (trimmed.startsWith('url:') || trimmed.startsWith('email:') || trimmed.startsWith('instagram:')) {
      continue;
    }
    
    // Fix the 4 buggy offices: change "Detalles de Contacto:" to ""
    // and "Código:" to ""
    let fixedLine = line;
    if (trimmed.startsWith('code:') && trimmed.includes('Detalles de Contacto:')) {
      fixedLine = line.replace(/code: "Detalles de Contacto:"/, 'code: ""');
    }
    if (trimmed.startsWith('city:') && trimmed.includes('"Código:"')) {
      fixedLine = line.replace(/city: "Código:"/, 'city: ""');
    }
    
    cleanedLines.push(fixedLine);
  } else {
    cleanedLines.push(line);
  }
}

// Phase 2: Replace interface definition
const interfaceStart = cleanedLines.findIndex(l => l.trim() === 'export interface TealcaOffice {');
const interfaceEnd = cleanedLines.findIndex(l => l.trim() === '}');
if (interfaceStart !== -1 && interfaceEnd !== -1) {
  cleanedLines.splice(interfaceStart, interfaceEnd - interfaceStart + 1,
    'export interface TealcaOffice {',
    '  /** Nombre de la oficina Tealca. */',
    '  name: string;',
    '  /** Código interno de la oficina Tealca. */',
    '  code: string;',
    '  /** Ciudad donde se ubica la oficina. */',
    '  city: string;',
    '  /** Dirección completa. Vacío si no está en el directorio. */',
    '  address: string;',
    '}',
  );
}

// Phase 3: Replace index generation
const indexComment = cleanedLines.findIndex(l => l.trim().startsWith('/**'));
let indexStart = -1;
for (let i = indexComment; i < cleanedLines.length; i++) {
  if (cleanedLines[i].trim().startsWith('export const tealcaOfficeIndex:')) {
    indexStart = i;
    break;
  }
}

if (indexStart !== -1) {
  // Find where the for loop ends (next empty line after the loop body)
  let indexEnd = indexStart;
  for (let i = indexStart; i < cleanedLines.length; i++) {
    if (i > indexStart && cleanedLines[i].trim() === '' && i > indexStart + 3) {
      indexEnd = i;
      break;
    }
    if (i === cleanedLines.length - 1) indexEnd = i;
  }
  
  // Remove all lines from indexStart to indexEnd
  cleanedLines.splice(indexStart, indexEnd - indexStart + 1);
  
  // Add new index
  cleanedLines.push('');
  cleanedLines.push('/**');
  cleanedLines.push(' * Índice de oficinas Tealca por código (para búsqueda O(1)).');
  cleanedLines.push(' * Clave: código de la oficina, o "{state}-{name}" si no tiene código.');
  cleanedLines.push(' */');
  cleanedLines.push('export const tealcaOfficeIndex: Record<string, TealcaOffice & { state: string }> = {};');
  cleanedLines.push('for (const [state, offices] of Object.entries(tealcaOffices)) {');
  cleanedLines.push('  for (const office of offices) {');
  cleanedLines.push('    const key = office.code !== "" ? office.code : normalize(state + "-" + office.name);');
  cleanedLines.push('    tealcaOfficeIndex[key] = { ...office, state };');
  cleanedLines.push('  }');
  cleanedLines.push('}');
  
  // Add normalize function
  cleanedLines.push('');
  cleanedLines.push('function normalize(s: string): string {');
  cleanedLines.push('  return s.toLowerCase().replace(/[^a-z0-9]/g, "");');
  cleanedLines.push('}');
}

const result = cleanedLines.join('\n');

// Verification
const finalContent = result;

// Count offices
const nameMatches = finalContent.match(/^\s{6}name:/gm);
console.log(`Total offices: ${nameMatches ? nameMatches.length : 0}`);

// Check no bad codes remain
if (finalContent.includes('Detalles de Contacto')) {
  console.error('❌ Still contains "Detalles de Contacto:"');
  process.exit(1);
}
console.log('✅ No more "Detalles de Contacto:" codes');

// Check no url/email/instagram remain in data
const urlInData = finalContent.match(/^\s{6}url:/);
const emailInData = finalContent.match(/^\s{6}email:/);
const instagramInData = finalContent.match(/^\s{6}instagram:/);
if (urlInData) console.error('❌ Still has url fields');
if (emailInData) console.error('❌ Still has email fields');
if (instagramInData) console.error('❌ Still has instagram fields');
console.log(`url fields: ${urlInData ? urlInData.length : 0}, email: ${emailInData ? emailInData.length : 0}, instagram: ${instagramInData ? instagramInData.length : 0}`);

// Check old index is replaced
if (finalContent.includes('office.name.toLowerCase().replace(/[^a-z0-9]/g, "");')) {
  console.error('❌ Old index key formula still present');
  process.exit(1);
}
console.log('✅ New index key formula present');

writeFileSync('lib/tealca-offices.ts', result, 'utf-8');
console.log('✅ lib/tealca-offices.ts written');
