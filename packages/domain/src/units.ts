/**
 * Unidades. Internamente todo se guarda en kg, m y s (ADR 0003); la conversión ocurre en el borde del cliente.
 *
 * Redondeo (coherente con la app actual, app.js):
 *  - Almacenamiento: kg con 2 decimales (numeric(6,2) en la base de datos).
 *  - Visualización: kg al 0,5 más cercano; lb al entero más cercano.
 *  - Incrementos de los botones +/−: 2,5 kg o 5 lb.
 *  - Redondeo «a discos»: múltiplos de 2,5 kg o 5 lb.
 * Con 2 decimales en kg, cualquier valor entero en lb sobrevive al viaje lb → kg → lb.
 */
export type WeightUnit = 'kg' | 'lb';

/** Factor exacto por definición (1 lb = 0,45359237 kg). */
export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB;

export const WEIGHT_STEP: Readonly<Record<WeightUnit, number>> = { kg: 2.5, lb: 5 };
export const DISPLAY_PRECISION: Readonly<Record<WeightUnit, number>> = { kg: 0.5, lb: 1 };

const roundTo = (value: number, increment: number): number => {
  const r = Math.round(value / increment) * increment;
  // Evita -0 y artefactos de coma flotante como 102.05999999
  return Number((r === 0 ? 0 : r).toFixed(6));
};

/** Redondea kg a 2 decimales (precisión de almacenamiento). */
export const normalizeKg = (kg: number): number => roundTo(kg, 0.01);

export const kgToLb = (kg: number): number => kg * LB_PER_KG;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;

/** Convierte un valor introducido en la unidad del usuario a kg de almacenamiento. */
export const toStorageKg = (value: number, unit: WeightUnit): number =>
  normalizeKg(unit === 'kg' ? value : lbToKg(value));

/** Valor para mostrar en la unidad del usuario (kg al 0,5; lb al entero). */
export const toDisplayWeight = (kg: number, unit: WeightUnit): number =>
  unit === 'kg' ? roundTo(kg, DISPLAY_PRECISION.kg) : roundTo(kgToLb(kg), DISPLAY_PRECISION.lb);

/** Redondea a lo que se puede cargar con discos: 2,5 kg o 5 lb. Devuelve kg. */
export const roundToPlates = (kg: number, unit: WeightUnit): number =>
  unit === 'kg' ? normalizeKg(roundTo(kg, WEIGHT_STEP.kg)) : toStorageKg(roundTo(kgToLb(kg), WEIGHT_STEP.lb), 'lb');

/** Suma o resta un incremento (2,5 kg / 5 lb) en la unidad del usuario. Nunca baja de 0. Devuelve kg. */
export const stepWeight = (kg: number, direction: 1 | -1, unit: WeightUnit): number => {
  const shown = unit === 'kg' ? kg : kgToLb(kg);
  return toStorageKg(Math.max(0, shown + direction * WEIGHT_STEP[unit]), unit);
};

/** Interpreta texto del usuario («82,5», «180») como peso en su unidad. Devuelve kg o null si no es válido. */
export const parseWeightInput = (text: string, unit: WeightUnit): number | null => {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value > (unit === 'kg' ? 1000 : 2204)) return null;
  return toStorageKg(value, unit);
};
