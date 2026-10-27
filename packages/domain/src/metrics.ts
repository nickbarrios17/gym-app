/**
 * Métricas derivadas. Deben coincidir con las vistas SQL (supabase/migrations/*_views_and_export.sql).
 * Las calorías calculadas con fórmulas son siempre ESTIMACIONES.
 */
export type SetType = 'warmup' | 'working' | 'drop' | 'failure';

export interface SetLike {
  weight_kg: number | null;
  reps: number | null;
  set_type?: SetType;
  deleted_at?: string | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Volumen de una serie (kg·reps). null si falta peso o repeticiones. */
export const setVolume = (s: SetLike): number | null =>
  s.weight_kg != null && s.reps != null && s.reps >= 1 ? s.weight_kg * s.reps : null;

/** Volumen total: excluye calentamientos y series borradas. */
export const totalVolume = (sets: readonly SetLike[]): number =>
  round2(
    sets.reduce((acc, s) => {
      if (s.deleted_at || s.set_type === 'warmup') return acc;
      return acc + (setVolume(s) ?? 0);
    }, 0),
  );

/** 1RM estimado de Epley: w · (1 + reps/30). Con 1 repetición es el propio peso. Redondeado a 2 decimales. */
export const epley1rm = (weightKg: number | null, reps: number | null): number | null => {
  if (weightKg == null || reps == null || reps < 1) return null;
  if (reps === 1) return weightKg;
  return round2(weightKg * (1 + reps / 30));
};

/** Mejor serie según la regla del prototipo: más peso; a igual peso, más repeticiones. */
export const topSet = <T extends SetLike>(sets: readonly T[]): T | null =>
  sets.reduce<T | null>((best, s) => {
    if (s.weight_kg == null || s.reps == null) return best;
    if (!best || best.weight_kg == null || best.reps == null) return s;
    if (s.weight_kg > best.weight_kg || (s.weight_kg === best.weight_kg && s.reps > best.reps)) return s;
    return best;
  }, null);

export interface PersonalBests {
  maxWeightKg: number | null;
  bestE1rmKg: number | null;
}

export interface PrFlags {
  isWeightPr: boolean;
  isE1rmPr: boolean;
}

/** Récords frente a los mejores valores de sesiones COMPLETADAS anteriores. Los calentamientos nunca son récord. */
export const detectPr = (set: SetLike, previous: PersonalBests): PrFlags => {
  if (set.set_type === 'warmup' || set.deleted_at) return { isWeightPr: false, isE1rmPr: false };
  const e1rm = epley1rm(set.weight_kg, set.reps);
  return {
    isWeightPr: set.weight_kg != null && set.weight_kg > (previous.maxWeightKg ?? 0),
    isE1rmPr: e1rm != null && e1rm > (previous.bestE1rmKg ?? 0),
  };
};

/** Mejores valores de una lista de series (para alimentar detectPr). */
export const personalBests = (sets: readonly SetLike[]): PersonalBests =>
  sets.reduce<PersonalBests>(
    (acc, s) => {
      if (s.set_type === 'warmup' || s.deleted_at) return acc;
      const e = epley1rm(s.weight_kg, s.reps);
      return {
        maxWeightKg: s.weight_kg != null ? Math.max(acc.maxWeightKg ?? 0, s.weight_kg) : acc.maxWeightKg,
        bestE1rmKg: e != null ? Math.max(acc.bestE1rmKg ?? 0, e) : acc.bestE1rmKg,
      };
    },
    { maxWeightKg: null, bestE1rmKg: null },
  );

/**
 * Estimación de energía (kcal) por MET, como en la app actual: MET · 3,5 · kg corporal / 200 por minuto.
 * El resultado es una ESTIMACIÓN y debe guardarse con energy_is_estimated = true.
 */
export const estimateKcal = (met: number, bodyWeightKg: number, activeSeconds: number): number =>
  Math.round(((met * 3.5 * bodyWeightKg) / 200) * (activeSeconds / 60) * 10) / 10;
