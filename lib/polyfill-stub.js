// Stub polyfill module — intended to replace next-polyfill-module.
//
// PageSpeed reporta ~13 KiB de polyfills legacy en el chunk
// 2p-uqugiu9o8q.js para: Array.prototype.at, Array.prototype.flat,
// Array.prototype.flatMap, Object.fromEntries, Object.hasOwn,
// String.prototype.trimEnd, String.prototype.trimStart.
//
// Nuestro browserslist objetivo (chrome >= 111, safari >= 16,
// firefox >= 111, edge >= 111) ya cubre nativamente todos estos
// métodos. Next.js, sin embargo, inyecta next-polyfill-module
// independientemente del browserslist (no expuesto públicamente
// como opción configurable — issue #86785).
//
// Este stub reemplaza next-polyfill-module en el bundle cliente
// mediante webpack resolve.alias en next.config.mjs, eliminando
// ~13 KiB de polyfills innecesarios.
//
// Si en el futuro se necesita un navegador más antiguo, reemplazar
// este archivo por una implementación real con core-js o similar.
