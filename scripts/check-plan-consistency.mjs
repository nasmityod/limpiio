#!/usr/bin/env node
/**
 * Valida PLAN-AUDITORIA-CORRECCION-MUNDOTECH.md:
 * - Parsea sesiones 01–32 y solo el checkbox principal (no subcriterios).
 * - Compara contadores del encabezado con el conteo real.
 * - Falla si una sesión [x] incluye frases de evidencia inválidas.
 * - Parsea **Cierre vigente:** exactamente una vez por sesión (la primera
 *   aparición, justo tras **Prioridad:**); el histórico posterior (evidencia
 *   de prompts siguientes) nunca altera el estado canónico.
 * - checkbox [x] exige **Cierre vigente:** COMPLETADO.
 * - checkbox [ ] no puede declarar **Cierre vigente:** COMPLETADO.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAN_PATH = resolve(__dirname, '..', 'PLAN-AUDITORIA-CORRECCION-MUNDOTECH.md');

/** Sesiones P1 (10) — resto no-P0 son medias/operativas (18). */
export const P1_SESSION_IDS = new Set([
  '05', '06', '07', '08', '09', '10', '12', '13', '23', '26',
]);

/** Frases prohibidas en evidencia de sesiones marcadas [x]. */
export const FORBIDDEN_DONE_PHRASES = [
  /\bno ejecutado/i,
  /\bPASS con (?:failure|errors|errores)/i,
  /\bpre-existing errors?\b/i,
  /\bpre-existing failure\b/i,
  /\bbloqueo conocido\b/i,
  /\bEstado:\s*COMPLETADO\s*\(con bloqueo/i,
  /\bbuild\s*—\s*BLOQUEADO\b/i,
];

const SESSION_HEADING_RE = /^## (\d{2}) — /;
const MAIN_CHECKBOX_RE = /^- \[([ x])\] \*\*/;
const COUNTER_RE =
  /^- \*\*(Completadas|Críticas P0 completadas|Altas P1 completadas|Medias\/operativas completadas):\*\* (\d+)\/(\d+)/;
const STATUS_SUMMARY_RE =
  /^\*\*Estado actual:\*\* (\d+) de 32 sesiones completadas/;
const CIERRE_VIGENTE_RE = /^\*\*Cierre vigente:\*\*\s*(COMPLETADO|PARCIAL|BLOQUEADO)\s*$/;

/** Valores canónicos permitidos para el campo `**Cierre vigente:**`. */
export const CIERRE_VIGENTE_VALUES = ['COMPLETADO', 'PARCIAL', 'BLOQUEADO'];

export function parsePlan(content) {
  const lines = content.split('\n');
  const sessions = [];
  const headerCounters = {};
  let statusSummaryCount = null;
  let current = null;
  let sectionLines = [];

  const flushCurrent = () => {
    if (!current) return;
    current.evidence = sectionLines.join('\n').trim();
    sessions.push(current);
  };

  for (const line of lines) {
    const statusMatch = line.match(STATUS_SUMMARY_RE);
    if (statusMatch) statusSummaryCount = Number(statusMatch[1]);

    const counterMatch = line.match(COUNTER_RE);
    if (counterMatch) headerCounters[counterMatch[1]] = Number(counterMatch[2]);

    const headingMatch = line.match(SESSION_HEADING_RE);
    if (headingMatch) {
      flushCurrent();
      current = {
        id: headingMatch[1],
        title: line.replace(SESSION_HEADING_RE, '').trim(),
        checked: null,
        priority: null,
        cierreVigente: null,
        cierreVigenteCount: 0,
        evidence: '',
      };
      sectionLines = [];
      continue;
    }

    if (!current) continue;
    sectionLines.push(line);

    if (current.checked === null) {
      const checkboxMatch = line.match(MAIN_CHECKBOX_RE);
      if (checkboxMatch) current.checked = checkboxMatch[1] === 'x';
    }

    if (/^\*\*Prioridad:\*\*/.test(line)) {
      const priorityMatch = line.match(
        /\*\*Prioridad:\*\*\s*(P0|P1|P2|Cierre obligatorio)/,
      );
      if (priorityMatch) current.priority = priorityMatch[1];
    }

    const cierreVigenteMatch = line.match(CIERRE_VIGENTE_RE);
    if (cierreVigenteMatch) {
      current.cierreVigenteCount += 1;
      // El histórico (evidencia de prompts posteriores) nunca sobreescribe el
      // estado canónico: solo cuenta la primera aparición (inmediatamente
      // después de **Prioridad:**).
      if (current.cierreVigente === null) {
        current.cierreVigente = cierreVigenteMatch[1];
      }
    }
  }

  flushCurrent();

  const completed = sessions.filter((session) => session.checked === true);
  const p0Sessions = sessions.filter((session) => session.priority === 'P0');
  const p1Sessions = sessions.filter((session) => P1_SESSION_IDS.has(session.id));
  const mediaSessions = sessions.filter(
    (session) => session.priority !== 'P0' && !P1_SESSION_IDS.has(session.id),
  );

  const counts = {
    total: completed.length,
    p0: p0Sessions.filter((session) => session.checked).length,
    p1: p1Sessions.filter((session) => session.checked).length,
    media: mediaSessions.filter((session) => session.checked).length,
    p0Total: p0Sessions.length,
    p1Total: p1Sessions.length,
    mediaTotal: mediaSessions.length,
  };

  return { sessions, headerCounters, statusSummaryCount, counts };
}

/** @returns {string[]} */
export function forbiddenPhrasesInDoneSession(session) {
  if (!session.checked || !session.evidence) {
    return [];
  }
  const hits = [];
  for (const pattern of FORBIDDEN_DONE_PHRASES) {
    if (pattern.test(session.evidence)) {
      hits.push(pattern.source);
    }
  }
  return hits;
}

/** @returns {string[]} */
export function validatePlanConsistency(parsed) {
  const errors = [];
  const { sessions, headerCounters, statusSummaryCount, counts } = parsed;

  if (sessions.length !== 32) {
    errors.push(`Se esperaban 32 sesiones, se parsearon ${sessions.length}.`);
  }

  if (statusSummaryCount === null) {
    errors.push('Falta el resumen **Estado actual:** N de 32 sesiones completadas.');
  } else if (statusSummaryCount !== counts.total) {
    errors.push(
      `Resumen Estado actual: ${statusSummaryCount}/32, parseado ${counts.total}/32.`,
    );
  }

  for (const session of sessions) {
    if (session.checked === null) {
      errors.push(`Sesión ${session.id}: falta checkbox principal.`);
    }
    const forbidden = forbiddenPhrasesInDoneSession(session);
    for (const phrase of forbidden) {
      errors.push(
        `Sesión ${session.id} está [x] pero la evidencia contiene frase prohibida (${phrase}).`,
      );
    }

    if (session.cierreVigenteCount === 0) {
      errors.push(`Sesión ${session.id}: falta el campo **Cierre vigente:**.`);
    } else if (session.cierreVigenteCount > 1) {
      errors.push(
        `Sesión ${session.id}: **Cierre vigente:** aparece ${session.cierreVigenteCount} veces (debe ser exactamente 1).`,
      );
    }

    if (session.checked === true && session.cierreVigente !== 'COMPLETADO') {
      errors.push(
        `Sesión ${session.id} está [x] pero **Cierre vigente:** es ${session.cierreVigente ?? 'ausente'} (exige COMPLETADO).`,
      );
    }

    if (session.checked === false && session.cierreVigente === 'COMPLETADO') {
      errors.push(
        `Sesión ${session.id} está [ ] pero **Cierre vigente:** es COMPLETADO (checkbox pendiente no puede declararse COMPLETADO).`,
      );
    }
  }

  const expectedHeader = {
    Completadas: counts.total,
    'Críticas P0 completadas': counts.p0,
    'Altas P1 completadas': counts.p1,
    'Medias/operativas completadas': counts.media,
  };

  for (const [label, value] of Object.entries(expectedHeader)) {
    const headerValue = headerCounters[label];
    const totalKey =
      label === 'Completadas'
        ? 32
        : label === 'Críticas P0 completadas'
          ? counts.p0Total
          : label === 'Altas P1 completadas'
            ? counts.p1Total
            : counts.mediaTotal;

    if (headerValue === undefined) {
      errors.push(`Falta contador de encabezado: "${label}".`);
      continue;
    }
    if (headerValue !== value) {
      errors.push(
        `Contador "${label}": encabezado ${headerValue}/${totalKey}, parseado ${value}/${totalKey}.`,
      );
    }
  }

  return errors;
}

/** @param {string} [planPath] */
export function checkPlanFile(planPath = PLAN_PATH) {
  const content = readFileSync(planPath, 'utf8');
  const parsed = parsePlan(content);
  const errors = validatePlanConsistency(parsed);
  return { ok: errors.length === 0, errors, counts: parsed.counts };
}

export function main() {
  const result = checkPlanFile();
  const { counts } = result;

  console.log(
    `Plan: ${counts.total}/32 completadas | P0 ${counts.p0}/${counts.p0Total} | P1 ${counts.p1}/${counts.p1Total} | medias ${counts.media}/${counts.mediaTotal}`,
  );

  if (result.ok) {
    console.log('OK: plan consistente con checkboxes principales y contadores.');
    return;
  }

  console.error('ERROR: inconsistencias en el plan de auditoría:');
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
  process.exitCode = 1;
}

const invokedAsScript =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsScript) {
  main();
}
