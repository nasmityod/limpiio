/** Normalize ISO and explicit Venezuelan day/month/year dates; reject Date.parse rollover and ambiguous text. */
export function normalizeBcvDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(trimmed);
  const local = /^(\d{2})\/(\d{2})\/(\d{4})(?:[, ]+([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?$/.exec(trimmed);
  if (!iso && !local) return null;
  const year = Number(iso ? iso[1] : local![3]);
  const month = Number(iso ? iso[2] : local![2]);
  const day = Number(iso ? iso[3] : local![1]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day) return null;
  const raw = iso ? (trimmed.length === 10 ? `${trimmed}T00:00:00-04:00` : trimmed) : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${local![4] ?? '00'}:${local![5] ?? '00'}:${local![6] ?? '00'}-04:00`;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
