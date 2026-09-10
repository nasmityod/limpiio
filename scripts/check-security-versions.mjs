#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function parseStableSemver(version) {
  if (typeof version !== 'string') {
    return null;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function isAllowedNextVersion(version) {
  const parsed = parseStableSemver(version);
  if (!parsed) {
    return false;
  }
  return (
    parsed.major === 16 &&
    (
      parsed.minor > 2 ||
      (parsed.minor === 2 && parsed.patch >= 6)
    )
  );
}

function readInstalledVersion(packageName) {
  const pkgPath = resolve(
    __dirname,
    '..',
    'node_modules',
    packageName,
    'package.json',
  );
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

export function main() {
  const versions = {
    next: readInstalledVersion('next'),
    react: readInstalledVersion('react'),
    reactDom: readInstalledVersion('react-dom'),
  };

  console.log(`next: ${versions.next ?? 'NOT_FOUND'}`);
  console.log(`react: ${versions.react ?? 'NOT_FOUND'}`);
  console.log(`react-dom: ${versions.reactDom ?? 'NOT_FOUND'}`);

  if (!versions.next) {
    console.error(
      'ERROR: No se pudo leer la versión instalada de Next.js.',
    );
    process.exitCode = 1;
    return;
  }

  if (!isAllowedNextVersion(versions.next)) {
    console.error(
      `ERROR: Next.js ${versions.next} no cumple el mínimo seguro 16.2.6 dentro de major 16.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'OK: Next.js cumple el mínimo seguro >=16.2.6 dentro de major 16.',
  );
}

const invokedAsScript =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsScript) {
  main();
}
