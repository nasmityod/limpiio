/**
 * node-pg / pg-connection-string (hasta pg 8) tratan sslmode prefer|require|verify-ca
 * como alias de verify-full. En pg 9 / libpq será distinto y se emite un SECURITY WARNING.
 *
 * Forzar `verify-full` mantiene el comportamiento actual y elimina el ruido en logs (p. ej. Vercel).
 *
 * @see https://www.postgresql.org/docs/current/libpq-ssl.html
 */
export function normalizePostgresUrlForNodePg(url: string | undefined): string | undefined {
  if (url == null || url === '') return url;
  return url.replace(/\bsslmode=(prefer|require|verify-ca)\b/gi, 'sslmode=verify-full');
}
