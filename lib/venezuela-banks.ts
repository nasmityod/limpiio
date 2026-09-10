/**
 * Lista de bancos venezolanos para los selects de pago (PRD-129).
 * Datos de referencia del sistema bancario nacional — no son configuración de
 * la tienda (eso vive en readSettings()); por eso residen en lib/ y no en un
 * componente de visualización (R1).
 */
export const VENEZUELAN_BANKS = [
  'Banco de Venezuela',
  'Banesco',
  'Banco Mercantil',
  'BBVA Provincial',
  'Banco Exterior',
  'BNC (Banco Nacional de Crédito)',
  'Bancaribe',
  'Bancrecer',
  'Banplus',
  'Banco del Tesoro',
  'Banco Bicentenario del Pueblo',
  'Mi Banco',
  'Banco Activo',
  'Venezolano de Crédito',
  'Banco Fondo Común (BFC)',
  'Delsur',
  'Banco Plaza',
  '100% Banco',
  'Banco Sofitasa',
  'Banco de la Fuerza Armada (BANFANB)',
  'Otro',
] as const;
