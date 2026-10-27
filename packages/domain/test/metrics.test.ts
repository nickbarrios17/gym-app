import { describe, expect, it } from 'vitest';
import { detectPr, epley1rm, estimateKcal, personalBests, setVolume, topSet, totalVolume } from '../src/metrics';

describe('volumen', () => {
  it('peso × repeticiones', () => {
    expect(setVolume({ weight_kg: 100, reps: 5 })).toBe(500);
    expect(setVolume({ weight_kg: null, reps: 5 })).toBeNull();
    expect(setVolume({ weight_kg: 100, reps: 0 })).toBeNull();
  });

  it('excluye calentamientos y series borradas (igual que session_summaries)', () => {
    expect(
      totalVolume([
        { weight_kg: 60, reps: 10, set_type: 'warmup' },
        { weight_kg: 100, reps: 5, set_type: 'working' },
        { weight_kg: 200, reps: 1, set_type: 'working', deleted_at: '2026-01-01T00:00:00Z' },
      ]),
    ).toBe(500);
  });
});

describe('e1RM de Epley', () => {
  it('coincide con la vista SQL', () => {
    expect(epley1rm(100, 5)).toBe(116.67);
    expect(epley1rm(100, 8)).toBe(126.67);
    expect(epley1rm(105, 3)).toBe(115.5);
  });

  it('con 1 repetición es el propio peso; sin repeticiones no hay estimación', () => {
    expect(epley1rm(140, 1)).toBe(140);
    expect(epley1rm(140, 0)).toBeNull();
    expect(epley1rm(null, 5)).toBeNull();
  });
});

describe('récords', () => {
  const prev = personalBests([
    { weight_kg: 100, reps: 5 },
    { weight_kg: 60, reps: 20, set_type: 'warmup' },
  ]);

  it('calcula los mejores valores sin calentamientos', () => {
    expect(prev).toEqual({ maxWeightKg: 100, bestE1rmKg: 116.67 });
  });

  it('detecta récords de peso y de e1RM por separado', () => {
    expect(detectPr({ weight_kg: 105, reps: 3 }, prev)).toEqual({ isWeightPr: true, isE1rmPr: false });
    expect(detectPr({ weight_kg: 100, reps: 8 }, prev)).toEqual({ isWeightPr: false, isE1rmPr: true });
    expect(detectPr({ weight_kg: 100, reps: 5 }, prev)).toEqual({ isWeightPr: false, isE1rmPr: false });
  });

  it('un calentamiento nunca es récord; sin historial cualquier serie lo es', () => {
    expect(detectPr({ weight_kg: 300, reps: 5, set_type: 'warmup' }, prev).isWeightPr).toBe(false);
    expect(detectPr({ weight_kg: 20, reps: 5 }, { maxWeightKg: null, bestE1rmKg: null }).isWeightPr).toBe(true);
  });

  it('mejor serie según la regla del prototipo', () => {
    expect(topSet([{ weight_kg: 100, reps: 5 }, { weight_kg: 100, reps: 6 }, { weight_kg: 90, reps: 12 }])).toEqual({
      weight_kg: 100,
      reps: 6,
    });
    expect(topSet([])).toBeNull();
  });
});

describe('energía estimada', () => {
  it('usa la fórmula MET de la app actual', () => {
    // 6 MET · 3,5 · 75 kg / 200 = 7,875 kcal/min → 60 min
    expect(estimateKcal(6, 75, 3600)).toBe(472.5);
  });
});
