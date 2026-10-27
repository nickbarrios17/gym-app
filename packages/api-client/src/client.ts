/**
 * Cliente tipado de VIDA. Encapsula supabase-js: valida entradas con Zod, mapea errores a { code, message }
 * y reintenta con backoff solo las operaciones idempotentes.
 * La clave anónima es pública por diseño; la seguridad la imponen la RLS y las RPC del servidor.
 */
import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import {
  AddSessionExerciseInput,
  CreateExerciseInput,
  Device,
  DuplicateRoutineInput,
  Exercise,
  ExerciseHistoryRow,
  ExerciseSearchParams,
  ExportData,
  PersonalRecord,
  Preferences,
  PreferencesUpdate,
  Profile,
  ProfileUpdate,
  RecordSetInput,
  RegisterDeviceInput,
  Routine,
  RoutineItem,
  RoutineWithItems,
  SaveRoutineInput,
  SessionExercise,
  SessionSummary,
  SignInInput,
  SignUpInput,
  StartSessionInput,
  SyncCursor,
  TransitionSessionInput,
  UpdateSessionDetailsInput,
  UpdateSetInput,
  VidaError,
  WorkoutSession,
  WorkoutSessionWithExercises,
  WorkoutSet,
  Email,
  Password,
  Uuid,
  type CreateExerciseInputT,
  type Database,
  type ExerciseSearchParamsT,
  type PreferencesUpdateT,
  type ProfileUpdateT,
  type RecordSetInputT,
  type SaveRoutinePayloadT,
  type StartSessionInputT,
  type SyncCursorT,
  type TransitionSessionInputT,
  type UpdateSetPatchT,
} from '@vida/domain';
import type { z } from 'zod';
import { toVidaError } from './errors';
import { Outbox, type OutboxOp, type OutboxStorage } from './outbox';
import { withRetry, type RetryOptions } from './retry';

export interface VidaClientOptions {
  supabase?: SupabaseClientOptions<'public'>;
  retry?: RetryOptions;
}

export interface Page<T> {
  items: T[];
  nextCursor: SyncCursorT | null;
}

/** Tablas que admiten sincronización incremental por cursor (updated_at, id). */
export const SYNC_TABLES = [
  'devices',
  'exercises',
  'routines',
  'routine_exercises',
  'workout_sessions',
  'workout_session_exercises',
  'workout_sets',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Tipo de `data` en la rama de éxito de una respuesta de supabase-js ({ data, error: null }). */
type DataOf<R> = R extends { error: null; data: infer D } ? D : never;

/** Valida la entrada; un fallo es VALIDATION_FAILED con un mensaje legible. */
const validate = <S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new VidaError('VALIDATION_FAILED', first?.message ?? 'Revisa los datos e inténtalo de nuevo.');
  }
  return parsed.data;
};

/** Valida la respuesta del servidor; si no encaja con el contrato no se entrega a la UI. */
const output = <S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new VidaError('UNKNOWN', 'Respuesta inesperada del servidor.');
  return parsed.data;
};

const unwrap = async <R extends { data: unknown; error: unknown }>(p: PromiseLike<R>): Promise<DataOf<R>> => {
  const { data, error } = await p;
  if (error) throw toVidaError(error);
  return data as DataOf<R>;
};

/** Escapa un valor para los filtros `or=(…)` de PostgREST. */
export const pgrstQuote = (v: string): string => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
/** Escapa comodines de LIKE en un texto de búsqueda del usuario. */
export const likeEscape = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '');

export function createVidaClient(url: string, anonKey: string, options: VidaClientOptions = {}) {
  if (!url || !anonKey) throw new VidaError('VALIDATION_FAILED', 'Faltan SUPABASE_URL o la clave anónima.');
  const sb: SupabaseClient<Database> = createClient<Database>(url, anonKey, options.supabase);
  const retry = <T>(fn: () => Promise<T>) => withRetry(fn, options.retry);

  const requireUserId = async (): Promise<string> => {
    const { data, error } = await sb.auth.getSession();
    if (error) throw toVidaError(error);
    const id = data.session?.user.id;
    if (!id) throw new VidaError('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
    return id;
  };

  // ───────────── Auth ─────────────
  const auth = {
    /** Registro con correo y contraseña. Perfil y preferencias se crean en el servidor (handle_new_user). */
    async signUp(input: z.input<typeof SignUpInput>, opts: { emailRedirectTo?: string } = {}) {
      const v = validate(SignUpInput, input);
      const data = await unwrap(
        sb.auth.signUp({
          email: v.email,
          password: v.password,
          options: {
            emailRedirectTo: opts.emailRedirectTo,
            data: {
              display_name: v.displayName,
              time_zone: v.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
              locale: v.locale ?? 'es',
            },
          },
        }),
      );
      return { userId: data.user?.id ?? null, needsEmailConfirmation: !data.session };
    },
    async signIn(input: z.input<typeof SignInInput>) {
      const v = validate(SignInInput, input);
      const data = await unwrap(sb.auth.signInWithPassword(v));
      return { userId: data.user.id };
    },
    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) throw toVidaError(error);
    },
    /** Envía el correo de recuperación (en local llega a Mailpit). */
    async requestPasswordReset(email: string, redirectTo?: string) {
      const v = validate(Email, email);
      await unwrap(sb.auth.resetPasswordForEmail(v, redirectTo ? { redirectTo } : undefined));
    },
    /** Cambia la contraseña de la sesión actual (también tras abrir el enlace de recuperación). */
    async updatePassword(newPassword: string) {
      const v = validate(Password, newPassword);
      await unwrap(sb.auth.updateUser({ password: v }));
    },
    /** Intercambia el código del enlace de recuperación/confirmación (flujo PKCE) por una sesión. */
    async exchangeCodeForSession(code: string) {
      await unwrap(sb.auth.exchangeCodeForSession(code));
    },
    /** Verifica el token del enlace de recuperación (parámetro `token` / token_hash) y abre sesión. */
    async verifyRecoveryLink(tokenHash: string) {
      if (!tokenHash) throw new VidaError('VALIDATION_FAILED', 'El enlace no es válido.');
      await unwrap(sb.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }));
    },
    currentUserId: async () => (await sb.auth.getSession()).data.session?.user.id ?? null,
    onChange: (cb: (userId: string | null) => void) =>
      sb.auth.onAuthStateChange((_event, session) => cb(session?.user.id ?? null)).data.subscription,
  };

  // ───────────── Perfil y preferencias ─────────────
  const profile = {
    async get() {
      const uid = await requireUserId();
      return output(Profile, await retry(() => unwrap(sb.from('profiles').select('*').eq('user_id', uid).single())));
    },
    async update(patch: ProfileUpdateT) {
      const v = validate(ProfileUpdate, patch);
      const uid = await requireUserId();
      return output(Profile, await unwrap(sb.from('profiles').update(v).eq('user_id', uid).select('*').single()));
    },
  };

  const preferences = {
    async get() {
      const uid = await requireUserId();
      return output(Preferences, await retry(() => unwrap(sb.from('user_preferences').select('*').eq('user_id', uid).single())));
    },
    async update(patch: PreferencesUpdateT) {
      const v = validate(PreferencesUpdate, patch);
      const uid = await requireUserId();
      return output(Preferences, await unwrap(sb.from('user_preferences').update(v).eq('user_id', uid).select('*').single()));
    },
  };

  const devices = {
    /** Registra (o refresca) este dispositivo. Idempotente por id. */
    async register(input: z.input<typeof RegisterDeviceInput>) {
      const v = validate(RegisterDeviceInput, input);
      const row = { ...v, last_seen_at: new Date().toISOString() };
      return output(Device, await retry(() => unwrap(sb.from('devices').upsert(row, { onConflict: 'id' }).select('*').single())));
    },
    async list() {
      return output(Device.array(), await retry(() => unwrap(sb.from('devices').select('*').order('created_at'))));
    },
    async remove(id: string) {
      validate(Uuid, id);
      await unwrap(sb.from('devices').delete().eq('id', id));
    },
  };

  // ───────────── Catálogo ─────────────
  const idsFrom = async (table: 'exercise_equipment' | 'exercise_muscles', column: string, value: string) => {
    const rows = await retry(() =>
      unwrap(sb.from(table).select('exercise_id').eq(column as never, value as never)),
    );
    return (rows as { exercise_id: string }[]).map((r) => r.exercise_id);
  };

  const exercises = {
    /** Búsqueda paginada por conjunto de claves (name, id). */
    async search(params: ExerciseSearchParamsT = {}) {
      const p = validate(ExerciseSearchParams, params);
      let q = sb.from('exercises').select('*').order('name').order('id').limit(p.limit + 1);
      if (p.query) q = q.ilike('name', `%${likeEscape(p.query)}%`);
      if (p.bodyPart) q = q.eq('body_part', p.bodyPart);
      if (p.scope === 'system') q = q.is('owner_id', null);
      if (p.scope === 'mine') q = q.not('owner_id', 'is', null);
      if (!p.includeArchived) q = q.is('archived_at', null);
      if (p.equipment) q = q.in('id', await idsFrom('exercise_equipment', 'equipment_code', p.equipment));
      if (p.muscle) q = q.in('id', await idsFrom('exercise_muscles', 'muscle_code', p.muscle));
      if (p.cursor) {
        const n = pgrstQuote(p.cursor.name);
        q = q.or(`name.gt.${n},and(name.eq.${n},id.gt.${p.cursor.id})`);
      }
      const rows = output(Exercise.array(), await retry(() => unwrap(q)));
      const items = rows.slice(0, p.limit);
      const last = items[items.length - 1];
      return { items, nextCursor: rows.length > p.limit && last ? { name: last.name, id: last.id } : null };
    },
    async get(id: string) {
      validate(Uuid, id);
      return output(Exercise, await retry(() => unwrap(sb.from('exercises').select('*').eq('id', id).single())));
    },
    async details(id: string) {
      validate(Uuid, id);
      const [muscles, equipment] = await Promise.all([
        retry(() => unwrap(sb.from('exercise_muscles').select('muscle_code, role').eq('exercise_id', id))),
        retry(() => unwrap(sb.from('exercise_equipment').select('equipment_code').eq('exercise_id', id))),
      ]);
      return { muscles, equipment: equipment.map((e) => e.equipment_code) };
    },
    async create(input: CreateExerciseInputT) {
      const v = validate(CreateExerciseInput, input);
      const uid = await requireUserId();
      return output(Exercise, await unwrap(sb.from('exercises').insert({ ...v, owner_id: uid }).select('*').single()));
    },
    async archive(id: string) {
      validate(Uuid, id);
      return output(
        Exercise,
        await unwrap(sb.from('exercises').update({ archived_at: new Date().toISOString() }).eq('id', id).select('*').single()),
      );
    },
  };

  // ───────────── Rutinas ─────────────
  const routines = {
    async list({ includeArchived = false } = {}) {
      let q = sb.from('routines').select('*').is('deleted_at', null).order('created_at');
      if (!includeArchived) q = q.is('archived_at', null);
      const list = output(Routine.array(), await retry(() => unwrap(q)));
      if (list.length === 0) return [];
      const items = output(
        RoutineItem.array(),
        await retry(() =>
          unwrap(sb.from('routine_exercises').select('*').in('routine_id', list.map((r) => r.id)).order('position')),
        ),
      );
      return list.map((r) => ({ ...r, items: items.filter((i) => i.routine_id === r.id) }));
    },
    async get(id: string) {
      validate(Uuid, id);
      const r = output(Routine, await retry(() => unwrap(sb.from('routines').select('*').eq('id', id).single())));
      const items = output(
        RoutineItem.array(),
        await retry(() => unwrap(sb.from('routine_exercises').select('*').eq('routine_id', id).order('position'))),
      );
      return { ...r, items };
    },
    /** Guarda cabecera y ejercicios de forma atómica. expectedVersion null = crear. No se reintenta automáticamente. */
    async save(payload: SaveRoutinePayloadT, expectedVersion: number | null) {
      const v = validate(SaveRoutineInput, { payload, expectedVersion });
      const data = await unwrap(
        sb.rpc('save_routine', {
          p_payload: v.payload,
          ...(v.expectedVersion != null ? { p_expected_version: v.expectedVersion } : {}),
        }),
      );
      return output(RoutineWithItems, data);
    },
    async duplicate(id: string, newId?: string) {
      const v = validate(DuplicateRoutineInput, { id, newId });
      const data = await retry(() =>
        unwrap(sb.rpc('duplicate_routine', { p_id: v.id, ...(v.newId ? { p_new_id: v.newId } : {}) })),
      );
      return output(RoutineWithItems, data);
    },
    async archive(id: string, archived = true) {
      validate(Uuid, id);
      return output(
        Routine,
        await unwrap(
          sb.from('routines').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id).select('*').single(),
        ),
      );
    },
    /** Borrado lógico (tombstone para la sincronización). */
    async remove(id: string) {
      validate(Uuid, id);
      await unwrap(sb.from('routines').update({ deleted_at: new Date().toISOString() }).eq('id', id));
    },
  };

  // ───────────── Sesiones y series ─────────────
  type Runner = <T>(fn: () => Promise<T>) => Promise<T>;
  /** Operaciones idempotentes de sesión/serie. `run` decide si se reintenta (cliente) o no (cola offline). */
  const sessionOps = (run: Runner) => ({
    async start(input: StartSessionInputT) {
      const v = validate(StartSessionInput, input);
      const data = await run(() =>
        unwrap(
          sb.rpc('start_session', {
            p_id: v.id,
            ...(v.routineId ? { p_routine_id: v.routineId } : {}),
            ...(v.deviceId ? { p_device_id: v.deviceId } : {}),
            ...(v.clientTs ? { p_client_ts: v.clientTs } : {}),
            ...(v.name ? { p_name: v.name } : {}),
          }),
        ),
      );
      return output(WorkoutSessionWithExercises, data);
    },
    async addExercise(input: z.input<typeof AddSessionExerciseInput>) {
      const v = validate(AddSessionExerciseInput, input);
      const data = await run(() =>
        unwrap(
          sb.rpc('add_session_exercise', {
            p_id: v.id,
            p_session_id: v.sessionId,
            p_exercise_id: v.exerciseId,
            ...(v.targetSets ? { p_target_sets: v.targetSets } : {}),
          }),
        ),
      );
      return output(SessionExercise, data);
    },
    async recordSet(input: RecordSetInputT) {
      const v = validate(RecordSetInput, input);
      const args = {
        p_id: v.id,
        p_session_exercise_id: v.sessionExerciseId,
        p_set_index: v.setIndex,
        p_set_type: v.setType,
        ...(v.weightKg !== undefined ? { p_weight_kg: v.weightKg } : {}),
        ...(v.reps !== undefined ? { p_reps: v.reps } : {}),
        ...(v.durationS !== undefined ? { p_duration_s: v.durationS } : {}),
        ...(v.distanceM !== undefined ? { p_distance_m: v.distanceM } : {}),
        ...(v.rpe !== undefined ? { p_rpe: v.rpe } : {}),
        ...(v.restS !== undefined ? { p_rest_s: v.restS } : {}),
        ...(v.completedAt ? { p_completed_at: v.completedAt } : {}),
        ...(v.clientTs ? { p_client_ts: v.clientTs } : {}),
        ...(v.deviceId ? { p_device_id: v.deviceId } : {}),
      };
      return output(WorkoutSet, await run(() => unwrap(sb.rpc('record_set', args))));
    },
    /** Idempotente en efecto: reaplicar el mismo patch deja la misma fila. */
    async updateSet(id: string, patch: UpdateSetPatchT) {
      const v = validate(UpdateSetInput, { id, patch });
      return output(WorkoutSet, await run(() => unwrap(sb.rpc('update_set', { p_id: v.id, p_patch: v.patch }))));
    },
    async deleteSet(id: string) {
      validate(Uuid, id);
      return output(WorkoutSet, await run(() => unwrap(sb.rpc('delete_set', { p_id: id }))));
    },
    async transition(input: TransitionSessionInputT) {
      const v = validate(TransitionSessionInput, input);
      const data = await run(() =>
        unwrap(
          sb.rpc('transition_session', {
            p_id: v.id,
            p_action: v.action,
            ...(v.clientTs ? { p_client_ts: v.clientTs } : {}),
            ...(v.energyKcal !== undefined ? { p_energy_kcal: v.energyKcal } : {}),
          }),
        ),
      );
      return output(WorkoutSessionWithExercises, data);
    },
  });

  const sessions = {
    ...sessionOps(retry),
    /** Notas, etiquetas y nombre (permitido también en sesiones terminadas). */
    async updateDetails(input: z.input<typeof UpdateSessionDetailsInput>) {
      const { id, ...patch } = validate(UpdateSessionDetailsInput, input);
      return output(WorkoutSession, await unwrap(sb.from('workout_sessions').update(patch).eq('id', id).select('*').single()));
    },
    /** Borrado lógico de una sesión terminada. */
    async remove(id: string) {
      validate(Uuid, id);
      await unwrap(sb.from('workout_sessions').update({ deleted_at: new Date().toISOString() }).eq('id', id));
    },
    /** Sesión activa (en curso o pausada) para recuperarla al abrir cualquier dispositivo. */
    async active() {
      const rows = output(
        WorkoutSession.array(),
        await retry(() => unwrap(sb.from('workout_sessions').select('*').in('status', ['in_progress', 'paused']).limit(1))),
      );
      return rows[0] ? sessions.get(rows[0].id) : null;
    },
    async get(id: string) {
      validate(Uuid, id);
      const [s, exercisesRows, sets] = await Promise.all([
        retry(() => unwrap(sb.from('workout_sessions').select('*').eq('id', id).single())),
        retry(() => unwrap(sb.from('workout_session_exercises').select('*').eq('session_id', id).order('position'))),
        retry(() =>
          unwrap(sb.from('workout_sets').select('*').eq('session_id', id).is('deleted_at', null).order('set_index')),
        ),
      ]);
      return {
        ...output(WorkoutSession, s),
        exercises: output(SessionExercise.array(), exercisesRows),
        sets: output(WorkoutSet.array(), sets),
      };
    },
    /** Historial de sesiones (más recientes primero), paginado por (started_at, id). */
    async list({ limit = 20, before }: { limit?: number; before?: { startedAt: string; id: string } } = {}) {
      let q = sb
        .from('session_summaries')
        .select('*')
        .order('started_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);
      if (before) {
        const t = pgrstQuote(before.startedAt);
        q = q.or(`started_at.lt.${t},and(started_at.eq.${t},id.lt.${validate(Uuid, before.id)})`);
      }
      const rows = output(SessionSummary.array(), await retry(() => unwrap(q)));
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      return { items, nextCursor: rows.length > limit && last ? { startedAt: last.started_at, id: last.id } : null };
    },
  };

  // ───────────── Historial y récords ─────────────
  const history = {
    async exercise(exerciseId: string, { limit = 100 } = {}) {
      validate(Uuid, exerciseId);
      return output(
        ExerciseHistoryRow.array(),
        await retry(() =>
          unwrap(
            sb
              .from('exercise_history')
              .select('*')
              .eq('exercise_id', exerciseId)
              .order('started_at', { ascending: false })
              .order('set_index')
              .limit(limit),
          ),
        ),
      );
    },
    async personalRecords() {
      return output(PersonalRecord.array(), await retry(() => unwrap(sb.from('personal_records').select('*'))));
    },
  };

  // ───────────── Sincronización (pull) ─────────────
  const sync = {
    /** Cambios desde el cursor, incluidas filas con deleted_at (tombstones). Orden (updated_at, id). */
    async pull(table: SyncTable, after?: SyncCursorT, limit = 200): Promise<Page<Record<string, unknown>>> {
      if (!SYNC_TABLES.includes(table)) throw new VidaError('VALIDATION_FAILED', 'Tabla no sincronizable.');
      if (after) validate(SyncCursor, after);
      let q = sb.from(table).select('*').order('updated_at').order('id').limit(limit);
      if (table === 'exercises') q = q.not('owner_id', 'is', null);
      if (after) {
        const t = pgrstQuote(after.updatedAt);
        q = q.or(`updated_at.gt.${t},and(updated_at.eq.${t},id.gt.${after.id})`);
      }
      const items = (await retry(() => unwrap(q))) as Record<string, unknown>[];
      const last = items[items.length - 1];
      return {
        items,
        nextCursor: last ? { updatedAt: String(last.updated_at), id: String(last.id) } : (after ?? null),
      };
    },
  };

  // ───────────── Cuenta ─────────────
  const account = {
    async exportData() {
      return output(ExportData, await retry(() => unwrap(sb.rpc('export_my_data'))));
    },
    /** Elimina la cuenta y todos sus datos (Edge Function delete-account). Irreversible. */
    async deleteAccount() {
      await requireUserId();
      const { error } = await sb.functions.invoke('delete-account', { body: { confirm: true } });
      if (error) throw toVidaError(error);
      await sb.auth.signOut({ scope: 'local' });
    },
  };

  // ───────────── Cola offline ─────────────
  const outboxOps = sessionOps((fn) => fn()); // sin reintentos internos: la cola decide cuándo reintentar
  const executeOutboxOp = (op: OutboxOp): Promise<unknown> => {
    switch (op.kind) {
      case 'start_session':
        return outboxOps.start(op.input);
      case 'add_session_exercise':
        return outboxOps.addExercise(op.input);
      case 'record_set':
        return outboxOps.recordSet(op.input);
      case 'update_set':
        return outboxOps.updateSet(op.input.id, op.input.patch);
      case 'delete_set':
        return outboxOps.deleteSet(op.input.id);
      case 'transition_session':
        return outboxOps.transition(op.input);
    }
  };

  return {
    supabase: sb,
    auth,
    profile,
    preferences,
    devices,
    exercises,
    routines,
    sessions,
    history,
    sync,
    account,
    createOutbox: (storage: OutboxStorage) => new Outbox(storage, executeOutboxOp),
  };
}

export type VidaClient = ReturnType<typeof createVidaClient>;
