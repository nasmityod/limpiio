// Browser-only state. Store the fingerprint rather than personal checkout details.
let memoryAttempt: { fingerprint: string; key: string } | null = null;
const STORAGE_KEY = 'checkout-operation-v1';

export async function getCheckoutAttemptKey(payload: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const fingerprint = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  let saved = memoryAttempt;
  try { saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') ?? saved; } catch { /* Storage unavailable. */ }
  if (saved?.fingerprint === fingerprint && /^[A-Za-z0-9_-]{16,128}$/.test(saved.key)) return saved.key;
  memoryAttempt = { fingerprint, key: crypto.randomUUID() };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryAttempt)); } catch { /* Keep memory fallback. */ }
  return memoryAttempt.key;
}

export function finishCheckoutAttempt(): void {
  memoryAttempt = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage unavailable. */ }
}
