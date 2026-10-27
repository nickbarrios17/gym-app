import { describe, expect, it } from 'vitest';
import {
  kgToLb,
  lbToKg,
  normalizeKg,
  parseWeightInput,
  roundToPlates,
  stepWeight,
  toDisplayWeight,
  toStorageKg,
} from '../src/units';

describe('conversión kg/lb', () => {
  it('usa el factor exacto', () => {
    expect(lbToKg(1)).toBeCloseTo(0.45359237, 10);
    expect(kgToLb(100)).toBeCloseTo(220.462262, 5);
  });

  it('almacena kg con 2 decimales', () => {
    expect(toStorageKg(225, 'lb')).toBe(102.06);
    expect(normalizeKg(82.499999)).toBe(82.5);
  });

  it('cualquier peso entero en lb sobrevive al viaje lb → kg → lb', () => {
    for (let lb = 0; lb <= 2200; lb++) {
      expect(toDisplayWeight(toStorageKg(lb, 'lb'), 'lb')).toBe(lb);
    }
  });

  it('muestra kg al 0,5 y lb al entero (como la app actual)', () => {
    expect(toDisplayWeight(82.3, 'kg')).toBe(82.5);
    expect(toDisplayWeight(82.2, 'kg')).toBe(82);
    expect(toDisplayWeight(100, 'lb')).toBe(220);
  });
});

describe('incrementos 2,5 kg / 5 lb', () => {
  it('suma y resta en la unidad del usuario', () => {
    expect(stepWeight(100, 1, 'kg')).toBe(102.5);
    expect(stepWeight(100, -1, 'kg')).toBe(97.5);
    expect(toDisplayWeight(stepWeight(toStorageKg(225, 'lb'), 1, 'lb'), 'lb')).toBe(230);
  });

  it('nunca baja de 0', () => {
    expect(stepWeight(1, -1, 'kg')).toBe(0);
    expect(stepWeight(1, -1, 'lb')).toBe(0);
  });

  it('redondea a discos', () => {
    expect(roundToPlates(101.2, 'kg')).toBe(100);
    expect(roundToPlates(101.3, 'kg')).toBe(102.5);
    expect(toDisplayWeight(roundToPlates(toStorageKg(223, 'lb'), 'lb'), 'lb')).toBe(225);
  });
});

describe('parseWeightInput', () => {
  it('acepta coma o punto decimal', () => {
    expect(parseWeightInput('82,5', 'kg')).toBe(82.5);
    expect(parseWeightInput(' 82.5 ', 'kg')).toBe(82.5);
    expect(parseWeightInput('180', 'lb')).toBe(81.65);
  });

  it('rechaza texto inválido, negativos y valores imposibles', () => {
    expect(parseWeightInput('', 'kg')).toBeNull();
    expect(parseWeightInput('abc', 'kg')).toBeNull();
    expect(parseWeightInput('-5', 'kg')).toBeNull();
    expect(parseWeightInput('1e3', 'kg')).toBeNull();
    expect(parseWeightInput('1001', 'kg')).toBeNull();
  });
});
