import { describe, expect, it, vi } from 'vitest';
import { createVidaClient, likeEscape, pgrstQuote } from '../src/client';

const URL_ = 'http://127.0.0.1:54321';
const KEY = 'clave-anonima-de-prueba';
const se = '5c000000-0000-4000-8000-0000000000a1';
const setId = '5e000000-0000-4000-8000-000000000001';
const ts = '2026-10-27T02:08:01.343368+00:00';
const storedSet = {
  id: setId, user_id: se, session_id: se, session_exercise_id: se, set_index: 0, set_type: 'working',
  weight_kg: 100, reps: 5, duration_s: null, distance_m: null, rpe: null, rest_s: null,
  completed_at: ts, client_recorded_at: ts, device_id: null, deleted_at: null, created_at: ts, updated_at: ts,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const clientWith = (fetchImpl: typeof fetch) =>
  createVidaClient(URL_, KEY, {
    supabase: { global: { fetch: fetchImpl }, auth: { persistSession: false, autoRefreshToken: false } },
    retry: { sleep: async () => {}, retries: 3 },
  });

describe('createVidaClient', () => {
  it('exige URL y clave', () => {
    expect(() => createVidaClient('', KEY)).toThrow();
  });

  it('valida la entrada antes de tocar la red', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const c = clientWith(fetchMock);
    await expect(c.sessions.recordSet({ id: 'no-uuid', sessionExerciseId: se, setIndex: 0, reps: 5 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(c.sessions.transition({ id: se, action: 'reiniciar' as never })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(c.auth.signUp({ email: 'ana@vida.test', password: 'corta' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reintenta una operación idempotente (record_set) tras un fallo de red', async () => {
    let calls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      calls++;
      expect(String(input)).toBe(`${URL_}/rest/v1/rpc/record_set`);
      expect(JSON.parse(String(init?.body))).toMatchObject({ p_id: setId, p_weight_kg: 100, p_reps: 5 });
      if (calls === 1) throw new TypeError('fetch failed');
      return json(storedSet);
    });
    const c = clientWith(fetchMock);
    const row = await c.sessions.recordSet({ id: setId, sessionExerciseId: se, setIndex: 0, weightKg: 100, reps: 5 });
    expect(row.id).toBe(setId);
    expect(calls).toBe(2);
  });

  it('NO reintenta save_routine (no es idempotente con versión)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    const c = clientWith(fetchMock);
    await expect(c.routines.save({ id: se, name: 'Fuerza A' }, null)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('traduce errores de dominio de PostgREST a { code, message }', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ code: 'P0001', message: 'ACTIVE_SESSION_EXISTS', details: 'Ya tienes una sesión en curso.', hint: null }, 400),
    );
    const c = clientWith(fetchMock);
    await expect(c.sessions.start({ id: se })).rejects.toMatchObject({
      code: 'ACTIVE_SESSION_EXISTS',
      message: 'Ya tienes una sesión en curso.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza respuestas que no cumplen el contrato', async () => {
    const c = clientWith(vi.fn<typeof fetch>(async () => json({ id: setId })));
    await expect(c.sessions.deleteSet(setId)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('las operaciones que requieren sesión fallan sin usuario', async () => {
    const c = clientWith(vi.fn<typeof fetch>());
    await expect(c.profile.get()).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
    await expect(c.account.deleteAccount()).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });
});

describe('escapado de filtros', () => {
  it('pgrstQuote escapa comillas y barras', () => {
    expect(pgrstQuote('Press "militar"')).toBe('"Press \\"militar\\""');
    expect(pgrstQuote('a\\b')).toBe('"a\\\\b"');
  });

  it('likeEscape neutraliza comodines del usuario', () => {
    expect(likeEscape('100%_*')).toBe('100\\%\\_');
  });
});
