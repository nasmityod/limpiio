/** Normalización de rol admin (case-insensitive). Sin deps de servidor; usable en cliente. */
export function isAdminRole(role: string | null | undefined): boolean {
  return (role ?? '').toUpperCase() === 'ADMIN';
}
