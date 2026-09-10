/**
 * payment-proof.ts — validación del origen de `paymentProofUrl` (PRD-007).
 *
 * Los comprobantes legítimos provienen de `/api/checkout/upload-proof`, que
 * persiste en R2. Cualquier otra URL es un payload potencial de phishing/XSS
 * dirigido al admin.
 *
 * Sin dependencias de servidor: usable en Client Components (panel admin).
 */
import { isR2PublicHttpsUrl } from '@/lib/r2-public-url';

/** `true` para URLs https alojadas en el dominio público de R2. */
export function isTrustedPaymentProofUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return isR2PublicHttpsUrl(url);
}
