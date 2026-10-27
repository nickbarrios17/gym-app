import { describe, expect, it } from 'vitest';
import {
  ExportData,
  PreferencesUpdate,
  ProfileUpdate,
  RecordSetInput,
  SaveRoutinePayload,
  SignUpInput,
  StartSessionInput,
  TransitionSessionInput,
  UpdateSetPatch,
  WorkoutSet,
} from '../src/schemas';

const id = '6f1c0d2a-3b7e-4c51-9a10-000000000001';
const sid = 'a0000000-0000-4000-8000-00000000000a';

describe('entradas inválidas', () => {
  it('registro: contraseña débil y correo inválido', () => {
    expect(SignUpInput.safeParse({ email: 'no-es-correo', password: 'abc12345' }).success).toBe(false);
    expect(SignUpInput.safeParse({ email: 'ana@vida.test', password: 'corta1' }).success).toBe(false);
    expect(SignUpInput.safeParse({ email: 'ana@vida.test', password: 'solo-letras' }).success).toBe(false);
    expect(SignUpInput.parse({ email: ' Ana@Vida.TEST ', password: 'segura123' }).email).toBe('ana@vida.test');
  });

  it('perfil y preferencias: campos desconocidos y rangos', () => {
    expect(ProfileUpdate.safeParse({ user_id: sid }).success).toBe(false); // no se puede cambiar el dueño
    expect(ProfileUpdate.safeParse({ height_m: 3.5 }).success).toBe(false);
    expect(PreferencesUpdate.safeParse({ time_zone: 'Marte/Olimpo' }).success).toBe(false);
    expect(PreferencesUpdate.safeParse({ weight_unit: 'st' }).success).toBe(false);
    expect(PreferencesUpdate.safeParse({ time_zone: 'Europe/Madrid', week_start: 6 }).success).toBe(true);
  });

  it('rutina: días repetidos o fuera de rango, rep_max < rep_min', () => {
    const base = { id, name: 'Fuerza A' };
    expect(SaveRoutinePayload.safeParse({ ...base, schedule_days: [0, 0] }).success).toBe(false);
    expect(SaveRoutinePayload.safeParse({ ...base, schedule_days: [7] }).success).toBe(false);
    expect(SaveRoutinePayload.safeParse({ ...base, items: [{ exercise_id: id, rep_min: 10, rep_max: 8 }] }).success).toBe(false);
    expect(SaveRoutinePayload.safeParse({ ...base, name: '   ' }).success).toBe(false);
    const ok = SaveRoutinePayload.parse({ ...base, items: [{ exercise_id: id }] });
    expect(ok.items[0]?.target_sets).toBe(3);
    expect(ok.schedule_days).toEqual([]);
  });

  it('series: métricas, RPE y patch', () => {
    const base = { id, sessionExerciseId: sid, setIndex: 0 };
    expect(RecordSetInput.safeParse(base).success).toBe(false); // sin métricas
    expect(RecordSetInput.safeParse({ ...base, weightKg: 100, reps: 5, rpe: 7.3 }).success).toBe(false);
    expect(RecordSetInput.safeParse({ ...base, weightKg: -1, reps: 5 }).success).toBe(false);
    expect(RecordSetInput.safeParse({ ...base, weightKg: 100, reps: 5, rpe: 7.5 }).success).toBe(true);
    expect(UpdateSetPatch.safeParse({}).success).toBe(false);
    expect(UpdateSetPatch.safeParse({ user_id: sid }).success).toBe(false);
    expect(UpdateSetPatch.safeParse({ reps: null }).success).toBe(true);
  });

  it('sesión: ids, acciones y timestamps', () => {
    expect(StartSessionInput.safeParse({ id: 'no-uuid' }).success).toBe(false);
    expect(StartSessionInput.parse({ id }).routineId).toBeNull();
    expect(TransitionSessionInput.safeParse({ id, action: 'reiniciar' }).success).toBe(false);
    expect(TransitionSessionInput.safeParse({ id, action: 'pause', clientTs: 'ayer' }).success).toBe(false);
  });
});

describe('salidas del servidor', () => {
  it('acepta el formato de timestamps de PostgreSQL (to_jsonb)', () => {
    const row = {
      id,
      user_id: sid,
      session_id: sid,
      session_exercise_id: sid,
      set_index: 0,
      set_type: 'working',
      weight_kg: 100.0,
      reps: 5,
      duration_s: null,
      distance_m: null,
      rpe: null,
      rest_s: null,
      completed_at: '2026-10-27T02:08:01.343368+00:00',
      client_recorded_at: '2026-10-27T02:08:01.343368+00:00',
      device_id: null,
      deleted_at: null,
      created_at: '2026-10-27T02:08:01.343368+00:00',
      updated_at: '2026-10-27T02:08:01.343368+00:00',
    };
    expect(WorkoutSet.parse(row).weight_kg).toBe(100);
  });

  it('rechaza una exportación con formato desconocido', () => {
    expect(ExportData.safeParse({ format: 'otro' }).success).toBe(false);
  });
});
