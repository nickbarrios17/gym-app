/**
 * Integración contra Supabase LOCAL (supabase start). Se omite salvo que VIDA_IT=1.
 *   VIDA_IT=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… MAILPIT_URL=http://127.0.0.1:54324 \
 *     npm run test:integration -w @vida/api-client
 * Usa usuarios desechables con correos aleatorios; nunca datos reales.
 */
import { newId } from '@vida/domain';
import { describe, expect, it } from 'vitest';
import { createVidaClient, type VidaClient } from '../../src/client';
import { createMemoryOutboxStorage } from '../../src/outbox';

const enabled = process.env.VIDA_IT === '1';
const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_ANON_KEY ?? '';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const SQUAT = '6f1c0d2a-3b7e-4c51-9a10-000000000001';
const BENCH = '6f1c0d2a-3b7e-4c51-9a10-000000000003';
const PASSWORD = 'Entreno2026';

/** fetch que se puede «desconectar» para simular el modo sin conexión. */
const switchableFetch = () => {
  const state = { online: true };
  const f: typeof fetch = (input, init) => (state.online ? fetch(input, init) : Promise.reject(new TypeError('fetch failed')));
  return { state, fetch: f };
};

const makeClient = (f: typeof fetch = fetch): VidaClient =>
  createVidaClient(URL_, KEY, {
    supabase: { global: { fetch: f }, auth: { persistSession: false, autoRefreshToken: false } },
    retry: { retries: 2, baseDelayMs: 50 },
  });

const email = (name: string) => `${name}-${newId().slice(0, 8)}@vida.test`;

async function signedUp(name: string, f?: typeof fetch) {
  const c = makeClient(f);
  const mail = email(name);
  await c.auth.signUp({ email: mail, password: PASSWORD, displayName: name, timeZone: 'America/Argentina/Buenos_Aires' });
  await c.auth.signIn({ email: mail, password: PASSWORD });
  return { c, mail };
}

async function latestMailTo(address: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { HTML?: string; Text?: string };
      return `${msg.HTML ?? ''}\n${msg.Text ?? ''}`;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No llegó ningún correo a ${address}`);
}

describe.skipIf(!enabled)('VIDA contra Supabase local', () => {
  it('registro, perfil, preferencias y aislamiento entre usuarios', async () => {
    const { c: ana } = await signedUp('ana');
    const { c: beto } = await signedUp('beto');

    const profile = await ana.profile.get();
    expect(profile.display_name).toBe('ana');
    expect((await ana.preferences.get()).time_zone).toBe('America/Argentina/Buenos_Aires');
    await ana.preferences.update({ weight_unit: 'lb' });
    expect((await ana.preferences.get()).weight_unit).toBe('lb');

    // Beto no puede leer ni modificar el perfil de Ana
    const { data } = await beto.supabase.from('profiles').select('*').eq('user_id', profile.user_id);
    expect(data).toEqual([]);
    const upd = await beto.supabase.from('profiles').update({ display_name: 'x' }).eq('user_id', profile.user_id).select();
    expect(upd.data).toEqual([]);
  });

  it('credenciales incorrectas devuelven un error seguro', async () => {
    const { mail } = await signedUp('carla');
    await expect(makeClient().auth.signIn({ email: mail, password: 'Incorrecta1' })).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
      message: 'Correo o contraseña incorrectos.',
    });
  });

  it('recuperación de contraseña con Mailpit', async () => {
    const { mail } = await signedUp('dora');
    const anon = makeClient();
    await anon.auth.requestPasswordReset(mail, 'http://127.0.0.1:3000/restablecer-contrasena');
    const body = await latestMailTo(mail);
    const token = /[?&]token=([^&"'\s]+)/.exec(body.replace(/&amp;/g, '&'))?.[1];
    expect(token).toBeTruthy();
    await anon.auth.verifyRecoveryLink(decodeURIComponent(token!));
    await anon.auth.updatePassword('NuevaClave2026');
    await anon.auth.signOut();
    await expect(makeClient().auth.signIn({ email: mail, password: 'NuevaClave2026' })).resolves.toBeTruthy();
  });

  it('catálogo, rutinas y flujo completo de entrenamiento con reintentos', async () => {
    const { c } = await signedUp('eva');

    const found = await c.exercises.search({ query: 'sentadilla' });
    expect(found.items.map((e) => e.slug)).toContain('sentadilla');
    const page1 = await c.exercises.search({ limit: 2 });
    const page2 = await c.exercises.search({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id);

    const routineId = newId();
    const saved = await c.routines.save(
      { id: routineId, name: 'Fuerza A', schedule_days: [0, 3], items: [{ exercise_id: SQUAT, target_sets: 4, rep_min: 6, rep_max: 6 }] },
      null,
    );
    await expect(c.routines.save({ id: routineId, name: 'Vieja', items: [] }, saved.version - 1)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });

    const device = await c.devices.register({ id: newId(), kind: 'web', platform: 'test' });
    const sessionId = newId();
    const s = await c.sessions.start({ id: sessionId, routineId, deviceId: device.id });
    const again = await c.sessions.start({ id: sessionId, routineId, deviceId: device.id });
    expect(again.id).toBe(s.id);
    await expect(c.sessions.start({ id: newId() })).rejects.toMatchObject({ code: 'ACTIVE_SESSION_EXISTS' });

    const se = s.exercises[0]!.id;
    const setId = newId();
    await c.sessions.recordSet({ id: setId, sessionExerciseId: se, setIndex: 0, weightKg: 100, reps: 5 });
    await c.sessions.recordSet({ id: setId, sessionExerciseId: se, setIndex: 0, weightKg: 100, reps: 5 });
    expect((await c.sessions.get(sessionId)).sets).toHaveLength(1);

    // La rutina cambia; la instantánea de la sesión no
    await c.routines.save({ id: routineId, name: 'Fuerza A2', items: [{ exercise_id: BENCH }] }, saved.version);
    expect((await c.sessions.get(sessionId)).exercises[0]?.exercise_id).toBe(SQUAT);

    await c.sessions.transition({ id: sessionId, action: 'complete', energyKcal: 300 });
    await expect(
      c.sessions.recordSet({ id: newId(), sessionExerciseId: se, setIndex: 1, weightKg: 100, reps: 5 }),
    ).rejects.toMatchObject({ code: 'SESSION_CLOSED' });

    const prs = await c.history.personalRecords();
    expect(prs.find((p) => p.exercise_id === SQUAT)?.max_weight_kg).toBe(100);
    const list = await c.sessions.list();
    expect(list.items[0]?.energy_is_estimated).toBe(true);
  });

  it('cola offline: registra sin conexión y reenvía al reconectar', async () => {
    const net = switchableFetch();
    const { c } = await signedUp('fran', net.fetch);
    const outbox = c.createOutbox(createMemoryOutboxStorage());
    const sessionId = newId();
    const seId = newId();

    net.state.online = false;
    await outbox.enqueue({ kind: 'start_session', input: { id: sessionId, name: 'Sin red' } });
    await outbox.enqueue({ kind: 'add_session_exercise', input: { id: seId, sessionId, exerciseId: SQUAT } });
    await outbox.enqueue({ kind: 'record_set', input: { id: newId(), sessionExerciseId: seId, setIndex: 0, weightKg: 80, reps: 8 } });
    await outbox.enqueue({ kind: 'transition_session', input: { id: sessionId, action: 'complete' } });
    expect((await outbox.flush()).remaining).toBe(4);

    net.state.online = true;
    expect(await outbox.flush()).toMatchObject({ confirmed: 4, failed: 0, remaining: 0 });
    const s = await c.sessions.get(sessionId);
    expect(s.status).toBe('completed');
    expect(s.sets).toHaveLength(1);
  });

  it('exportación y borrado de cuenta', async () => {
    const { c, mail } = await signedUp('gabi');
    await c.routines.save({ id: newId(), name: 'Para exportar' }, null);
    const exported = await c.account.exportData();
    expect(exported.routines).toHaveLength(1);

    await c.account.deleteAccount();
    await expect(makeClient().auth.signIn({ email: mail, password: PASSWORD })).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });
  });
});
