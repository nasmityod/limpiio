import Papa from 'papaparse';

/**
 * Genera un CSV (UTF-8 con BOM para que Excel respete los acentos) a partir de
 * filas planas y dispara la descarga en el navegador. Solo cliente.
 */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (typeof window === 'undefined') return;

  const csv = Papa.unparse(rows, { quotes: true });
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Sufijo de fecha estable para nombres de archivo: 2026-06-07. */
export function csvDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
