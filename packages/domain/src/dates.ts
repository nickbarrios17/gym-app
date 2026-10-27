/**
 * Fechas. Instantes en UTC (timestamptz); la fecha local se calcula con la zona IANA del usuario
 * en el momento de escribir (ADR 0004). Convención de días: 0 = lunes … 6 = domingo.
 */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const isValidTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Fecha local 'YYYY-MM-DD' de un instante en una zona IANA. */
export const localDate = (instant: Date | string | number, timeZone: string): string => {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Zona horaria no válida: ${timeZone}`);
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) throw new RangeError('Instante no válido');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/** Día de la semana (0 = lunes) de una fecha local 'YYYY-MM-DD'. */
export const dayIndexOf = (isoDate: string): DayIndex => {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return ((js + 6) % 7) as DayIndex;
};

/** Día de la semana (0 = lunes) de un instante en una zona IANA. */
export const localDayIndex = (instant: Date | string | number, timeZone: string): DayIndex =>
  dayIndexOf(localDate(instant, timeZone));

/** Primer día de la semana local que contiene la fecha, según la preferencia week_start (0 = lunes). */
export const weekStartDate = (isoDate: string, weekStart: DayIndex = 0): string => {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const offset = (dayIndexOf(isoDate) - weekStart + 7) % 7;
  return new Date(Date.UTC(y, m - 1, d - offset)).toISOString().slice(0, 10);
};
