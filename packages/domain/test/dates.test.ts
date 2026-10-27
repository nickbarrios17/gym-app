import { describe, expect, it } from 'vitest';
import { dayIndexOf, isValidTimeZone, localDate, localDayIndex, weekStartDate } from '../src/dates';

describe('fecha local', () => {
  it('a medianoche UTC todavía es el día anterior en Buenos Aires', () => {
    expect(localDate('2026-10-27T01:00:00Z', 'America/Argentina/Buenos_Aires')).toBe('2026-10-26');
    expect(localDate('2026-10-27T03:00:00Z', 'America/Argentina/Buenos_Aires')).toBe('2026-10-27');
  });

  it('respeta el límite exacto de medianoche', () => {
    expect(localDate('2026-03-01T22:59:59Z', 'Europe/Madrid')).toBe('2026-03-01');
    expect(localDate('2026-03-01T23:00:00Z', 'Europe/Madrid')).toBe('2026-03-02');
  });

  it('maneja el cambio de horario de verano (Madrid, 29-mar-2026: 02:00 → 03:00)', () => {
    // 00:59 UTC = 01:59 CET (antes del cambio) ; 01:00 UTC = 03:00 CEST (después)
    expect(localDate('2026-03-29T00:59:00Z', 'Europe/Madrid')).toBe('2026-03-29');
    expect(localDate('2026-03-28T22:59:00Z', 'Europe/Madrid')).toBe('2026-03-28');
    expect(localDate('2026-03-28T23:00:00Z', 'Europe/Madrid')).toBe('2026-03-29');
    // Tras el cambio, la medianoche local es a las 22:00 UTC
    expect(localDate('2026-03-29T21:59:00Z', 'Europe/Madrid')).toBe('2026-03-29');
    expect(localDate('2026-03-29T22:00:00Z', 'Europe/Madrid')).toBe('2026-03-30');
  });

  it('maneja el fin del horario de verano (Nueva York, 1-nov-2026)', () => {
    expect(localDate('2026-11-01T03:59:00Z', 'America/New_York')).toBe('2026-10-31');
    expect(localDate('2026-11-01T04:00:00Z', 'America/New_York')).toBe('2026-11-01');
    expect(localDate('2026-11-02T04:59:00Z', 'America/New_York')).toBe('2026-11-01');
    expect(localDate('2026-11-02T05:00:00Z', 'America/New_York')).toBe('2026-11-02');
  });

  it('zonas con desfase no entero', () => {
    expect(localDate('2026-10-26T18:29:00Z', 'Asia/Kolkata')).toBe('2026-10-26');
    expect(localDate('2026-10-26T18:30:00Z', 'Asia/Kolkata')).toBe('2026-10-27');
  });

  it('rechaza zonas e instantes inválidos', () => {
    expect(isValidTimeZone('Marte/Olimpo')).toBe(false);
    expect(() => localDate('2026-10-27T00:00:00Z', 'Marte/Olimpo')).toThrow(RangeError);
    expect(() => localDate('no es fecha', 'UTC')).toThrow(RangeError);
  });
});

describe('días de la semana (0 = lunes)', () => {
  it('convierte fechas', () => {
    expect(dayIndexOf('2026-10-26')).toBe(0); // lunes
    expect(dayIndexOf('2026-11-01')).toBe(6); // domingo
    expect(localDayIndex('2026-10-26T02:00:00Z', 'America/Argentina/Buenos_Aires')).toBe(6); // aún domingo
  });

  it('inicio de semana según preferencia', () => {
    expect(weekStartDate('2026-10-29', 0)).toBe('2026-10-26');
    expect(weekStartDate('2026-10-29', 6)).toBe('2026-10-25');
    expect(weekStartDate('2026-10-26', 0)).toBe('2026-10-26');
  });
});
