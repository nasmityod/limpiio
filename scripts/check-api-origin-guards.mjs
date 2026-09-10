#!/usr/bin/env node

/**
 * PRD-SEC-09: Verifica que todos los Route Handlers de mutación
 * (POST/PUT/PATCH/DELETE) de navegador tengan un llamado a
 * rejectInvalidMutationOrigin en su árbol AST.
 *
 * Excepciones (allowlist exacta):
 *   app/api/auth/[...nextauth]/route.ts#POST -> NextAuth maneja CSRF internamente.
 *
 * Uso: node scripts/check-api-origin-guards.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(__dirname, '..', 'app', 'api');

/** Allowlist: ruta#METODO que están exentas del guard. */
const ALLOWLIST = new Set([
  'app/api/auth/[...nextauth]/route.ts#POST',
]);

/** Métodos HTTP que mutan estado */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Busca recursivamente archivos route.ts dentro de app/api/.
 */
function findRouteFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      results.push(...findRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Encuentra FunctionDeclaration con nombre exportado en el AST.
 */
function findExportedFunctionDeclarations(sourceFile) {
  const result = new Map();

  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      MUTATION_METHODS.has(node.name.text) &&
      isExported(node, sourceFile)
    ) {
      result.set(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

/**
 * Verifica si un nodo tiene un modificador export.
 */
function isExported(node, sourceFile) {
  const modifiers = ts.getCombinedModifierFlags(node);
  return (modifiers & ts.ModifierFlags.Export) !== 0;
}

/**
 * Busca una llamada a rejectInvalidMutationOrigin dentro del AST de una función.
 */
function hasRejectInvalidMutationOrigin(node) {
  let found = false;

  function visit(n) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'rejectInvalidMutationOrigin'
    ) {
      found = true;
      return;
    }
    if (!found) {
      ts.forEachChild(n, visit);
    }
  }

  visit(node);
  return found;
}

function main() {
  const routeFiles = findRouteFiles(API_DIR);
  const missing = [];

  for (const filePath of routeFiles) {
    const relativePath = filePath.startsWith(resolve(__dirname, '..') + sep)
      ? filePath.slice(resolve(__dirname, '..').length + 1)
      : filePath;

    const source = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const handlers = findExportedFunctionDeclarations(sourceFile);

    for (const [method, funcDecl] of handlers) {
      const key = `${relativePath}#${method}`;
      if (ALLOWLIST.has(key)) {
        continue;
      }

      if (!hasRejectInvalidMutationOrigin(funcDecl)) {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    for (const item of missing) {
      console.log(`MISSING_ORIGIN_GUARD ${item}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('OK: all browser mutation handlers have an origin guard');
}

main();
