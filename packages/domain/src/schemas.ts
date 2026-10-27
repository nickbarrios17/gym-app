/**
 * Esquemas Zod de las entradas y salidas de cada RPC y tabla expuesta.
 * Validan en el borde del cliente; la base de datos refuerza las mismas reglas con restricciones y triggers.
 */
import { z } from 'zod';
import { isValidTimeZone } from './dates';

// ── Primitivos ──
export const Uuid = z.string().uuid();
export const Timestamp = z.string().datetime({ offset: true });
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const DayIndexSchema = z.number().int().min(0).max(6);
export const WeightUnitSchema = z.enum(['kg', 'lb']);
export const TimeZoneSchema = z.string().min(1).refine(isValidTimeZone, 'Zona horaria no válida');
export const LocaleSchema = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);
const nullable = <T extends z.ZodTypeAny>(t: T) => t.nullable();

export const WeightKg = z.number().min(0).max(1000);
export const Reps = z.number().int().min(0).max(1000);
export const Rpe = z.number().min(1).max(10).refine((n) => Number.isInteger(n * 2), 'RPE en pasos de 0,5');

// ── Auth ──
export const Email = z.string().trim().toLowerCase().email().max(254);
export const Password = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72)
  .regex(/[A-Za-z]/, 'Incluye al menos una letra')
  .regex(/\d/, 'Incluye al menos un número');
export const SignUpInput = z.object({
  email: Email,
  password: Password,
  displayName: z.string().trim().min(1).max(80).optional(),
  timeZone: TimeZoneSchema.optional(),
  locale: LocaleSchema.optional(),
});
export const SignInInput = z.object({ email: Email, password: z.string().min(1).max(72) });

// ── Perfil y preferencias ──
export const OnboardingState = z.enum(['pending', 'in_progress', 'completed']);
export const Profile = z.object({
  user_id: Uuid,
  display_name: nullable(z.string()),
  birth_year: nullable(z.number().int()),
  height_m: nullable(z.number()),
  onboarding_state: OnboardingState,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const ProfileUpdate = z
  .object({
    display_name: nullable(z.string().trim().min(1).max(80)),
    birth_year: nullable(z.number().int().min(1900).max(new Date().getFullYear())),
    height_m: nullable(z.number().min(0.5).max(2.8)),
    onboarding_state: OnboardingState,
  })
  .partial()
  .strict();

export const Preferences = z.object({
  user_id: Uuid,
  weight_unit: WeightUnitSchema,
  locale: z.string(),
  time_zone: z.string(),
  week_start: DayIndexSchema,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const PreferencesUpdate = z
  .object({ weight_unit: WeightUnitSchema, locale: LocaleSchema, time_zone: TimeZoneSchema, week_start: DayIndexSchema })
  .partial()
  .strict();

export const DeviceKind = z.enum(['web', 'mobile', 'watch']);
export const Device = z.object({
  id: Uuid,
  user_id: Uuid,
  kind: DeviceKind,
  platform: nullable(z.string()),
  label: nullable(z.string()),
  last_seen_at: Timestamp,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const RegisterDeviceInput = z.object({
  id: Uuid,
  kind: DeviceKind,
  platform: z.string().min(1).max(40).optional(),
  label: z.string().min(1).max(80).optional(),
});

// ── Catálogo ──
export const MeasurementType = z.enum(['weight_reps', 'reps', 'duration', 'distance_duration']);
export const ExerciseCategory = z.enum(['strength', 'cardio', 'mobility', 'stretching', 'plyometrics']);
export const BodyPart = z.enum(['legs', 'back', 'chest', 'shoulders', 'arms', 'core', 'cardio', 'full_body']);
export const ExerciseInstructions = z
  .object({
    level: z.string().optional(),
    tempo: z.string().optional(),
    cues: z.array(z.object({ title: z.string(), detail: z.string() })).optional(),
    errors: z.array(z.object({ title: z.string(), fix: z.string() })).optional(),
    breathing: z.array(z.string()).optional(),
  })
  .passthrough();
export const Exercise = z.object({
  id: Uuid,
  owner_id: nullable(Uuid),
  slug: z.string(),
  name: z.string(),
  short_name: nullable(z.string()),
  description: nullable(z.string()),
  category: ExerciseCategory,
  body_part: nullable(BodyPart),
  measurement_type: MeasurementType,
  met: nullable(z.number()),
  instructions: ExerciseInstructions,
  media: z.array(z.record(z.unknown())),
  variation_of: nullable(Uuid),
  archived_at: nullable(Timestamp),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const ExerciseSearchParams = z
  .object({
    query: z.string().trim().max(80).optional(),
    bodyPart: BodyPart.optional(),
    equipment: z.string().max(40).optional(),
    muscle: z.string().max(40).optional(),
    scope: z.enum(['all', 'system', 'mine']).default('all'),
    includeArchived: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(40),
    cursor: z.object({ name: z.string(), id: Uuid }).optional(),
  })
  .strict();
export const CreateExerciseInput = z.object({
  id: Uuid.optional(),
  slug: z.string().regex(/^[a-z0-9]+([_-][a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(1).max(120),
  short_name: z.string().trim().min(1).max(40).optional(),
  description: z.string().max(2000).optional(),
  category: ExerciseCategory.default('strength'),
  body_part: BodyPart.optional(),
  measurement_type: MeasurementType.default('weight_reps'),
  variation_of: Uuid.optional(),
});

// ── Rutinas ──
export const RoutineItemInput = z
  .object({
    id: Uuid.optional(),
    exercise_id: Uuid,
    target_sets: z.number().int().min(1).max(20).default(3),
    rep_min: z.number().int().min(1).max(100).nullish(),
    rep_max: z.number().int().min(1).max(100).nullish(),
    target_rest_s: z.number().int().min(0).max(1800).nullish(),
    target_load_kg: WeightKg.nullish(),
    notes: z.string().max(1000).nullish(),
  })
  .refine((i) => i.rep_min == null || i.rep_max == null || i.rep_max >= i.rep_min, {
    message: 'rep_max debe ser ≥ rep_min',
    path: ['rep_max'],
  });
export const SaveRoutinePayload = z.object({
  id: Uuid,
  name: z.string().trim().min(1).max(80),
  notes: z.string().max(2000).nullish(),
  schedule_days: z
    .array(DayIndexSchema)
    .max(7)
    .refine((d) => new Set(d).size === d.length, 'Días repetidos')
    .default([]),
  items: z.array(RoutineItemInput).max(50).default([]),
});
export const SaveRoutineInput = z.object({
  payload: SaveRoutinePayload,
  expectedVersion: z.number().int().min(1).nullable(),
});
export const RoutineItem = z.object({
  id: Uuid,
  routine_id: Uuid,
  user_id: Uuid,
  exercise_id: Uuid,
  position: z.number().int(),
  target_sets: z.number().int(),
  rep_min: nullable(z.number().int()),
  rep_max: nullable(z.number().int()),
  target_rest_s: nullable(z.number().int()),
  target_load_kg: nullable(z.number()),
  notes: nullable(z.string()),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const Routine = z.object({
  id: Uuid,
  user_id: Uuid,
  name: z.string(),
  notes: nullable(z.string()),
  schedule_days: z.array(DayIndexSchema),
  version: z.number().int(),
  archived_at: nullable(Timestamp),
  deleted_at: nullable(Timestamp),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const RoutineWithItems = Routine.extend({ items: z.array(RoutineItem) });
export const DuplicateRoutineInput = z.object({ id: Uuid, newId: Uuid.optional() });

// ── Sesiones y series ──
export const SessionStatusSchema = z.enum(['in_progress', 'paused', 'completed', 'abandoned']);
export const SessionActionSchema = z.enum(['pause', 'resume', 'complete', 'abandon']);
export const SetTypeSchema = z.enum(['warmup', 'working', 'drop', 'failure']);

export const SessionExercise = z.object({
  id: Uuid,
  session_id: Uuid,
  user_id: Uuid,
  exercise_id: Uuid,
  position: z.number().int(),
  exercise_name: z.string(),
  target_sets: nullable(z.number().int()),
  rep_min: nullable(z.number().int()),
  rep_max: nullable(z.number().int()),
  target_rest_s: nullable(z.number().int()),
  target_load_kg: nullable(z.number()),
  notes: nullable(z.string()),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const WorkoutSession = z.object({
  id: Uuid,
  user_id: Uuid,
  routine_id: nullable(Uuid),
  routine_version: nullable(z.number().int()),
  name: z.string(),
  status: SessionStatusSchema,
  started_at: Timestamp,
  ended_at: nullable(Timestamp),
  paused_at: nullable(Timestamp),
  paused_seconds: z.number().int(),
  local_date: IsoDate,
  time_zone: z.string(),
  notes: nullable(z.string()),
  tags: z.array(z.string()),
  device_id: nullable(Uuid),
  energy_kcal: nullable(z.number()),
  energy_is_estimated: z.boolean(),
  deleted_at: nullable(Timestamp),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export const WorkoutSessionWithExercises = WorkoutSession.extend({ exercises: z.array(SessionExercise) });

export const WorkoutSet = z.object({
  id: Uuid,
  user_id: Uuid,
  session_id: Uuid,
  session_exercise_id: Uuid,
  set_index: z.number().int(),
  set_type: SetTypeSchema,
  weight_kg: nullable(z.number()),
  reps: nullable(z.number().int()),
  duration_s: nullable(z.number().int()),
  distance_m: nullable(z.number()),
  rpe: nullable(z.number()),
  rest_s: nullable(z.number().int()),
  completed_at: nullable(Timestamp),
  client_recorded_at: Timestamp,
  device_id: nullable(Uuid),
  deleted_at: nullable(Timestamp),
  created_at: Timestamp,
  updated_at: Timestamp,
});

export const StartSessionInput = z.object({
  id: Uuid,
  routineId: Uuid.nullable().default(null),
  deviceId: Uuid.nullable().default(null),
  clientTs: Timestamp.optional(),
  name: z.string().trim().min(1).max(120).optional(),
});
export const AddSessionExerciseInput = z.object({
  id: Uuid,
  sessionId: Uuid,
  exerciseId: Uuid,
  targetSets: z.number().int().min(1).max(20).optional(),
});
export const RecordSetInput = z
  .object({
    id: Uuid,
    sessionExerciseId: Uuid,
    setIndex: z.number().int().min(0).max(99),
    weightKg: WeightKg.optional(),
    reps: Reps.optional(),
    durationS: z.number().int().min(0).max(86400).optional(),
    distanceM: z.number().min(0).max(1_000_000).optional(),
    rpe: Rpe.optional(),
    restS: z.number().int().min(0).max(3600).optional(),
    setType: SetTypeSchema.default('working'),
    completedAt: Timestamp.optional(),
    clientTs: Timestamp.optional(),
    deviceId: Uuid.optional(),
  })
  .refine((s) => [s.weightKg, s.reps, s.durationS, s.distanceM].some((v) => v !== undefined), {
    message: 'Una serie necesita al menos una métrica',
  });
export const UpdateSetPatch = z
  .object({
    set_index: z.number().int().min(0).max(99),
    set_type: SetTypeSchema,
    weight_kg: WeightKg.nullable(),
    reps: Reps.nullable(),
    duration_s: z.number().int().min(0).max(86400).nullable(),
    distance_m: z.number().min(0).max(1_000_000).nullable(),
    rpe: Rpe.nullable(),
    rest_s: z.number().int().min(0).max(3600).nullable(),
    completed_at: Timestamp.nullable(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'No hay cambios');
export const UpdateSetInput = z.object({ id: Uuid, patch: UpdateSetPatch });
export const DeleteSetInput = z.object({ id: Uuid });
export const TransitionSessionInput = z.object({
  id: Uuid,
  action: SessionActionSchema,
  clientTs: Timestamp.optional(),
  energyKcal: z.number().min(0).max(20000).optional(),
});
export const UpdateSessionDetailsInput = z.object({
  id: Uuid,
  notes: z.string().max(4000).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

// ── Vistas ──
export const ExerciseHistoryRow = z.object({
  set_id: Uuid,
  user_id: Uuid,
  exercise_id: Uuid,
  exercise_name: z.string(),
  session_id: Uuid,
  session_status: SessionStatusSchema,
  started_at: Timestamp,
  local_date: IsoDate,
  set_index: z.number().int(),
  set_type: SetTypeSchema,
  weight_kg: nullable(z.number()),
  reps: nullable(z.number().int()),
  duration_s: nullable(z.number().int()),
  distance_m: nullable(z.number()),
  rpe: nullable(z.number()),
  completed_at: nullable(Timestamp),
  volume_kg: nullable(z.number()),
  e1rm_kg: nullable(z.number()),
  is_weight_pr: z.boolean(),
  is_e1rm_pr: z.boolean(),
});
export const PersonalRecord = z.object({
  user_id: Uuid,
  exercise_id: Uuid,
  exercise_name: z.string(),
  max_weight_kg: nullable(z.number()),
  max_reps: nullable(z.number().int()),
  best_e1rm_kg: nullable(z.number()),
  best_set_volume_kg: nullable(z.number()),
  total_sets: z.number().int(),
  last_performed_at: Timestamp,
});
export const SessionSummary = z.object({
  id: Uuid,
  user_id: Uuid,
  routine_id: nullable(Uuid),
  name: z.string(),
  status: SessionStatusSchema,
  started_at: Timestamp,
  ended_at: nullable(Timestamp),
  local_date: IsoDate,
  time_zone: z.string(),
  notes: nullable(z.string()),
  tags: z.array(z.string()),
  energy_kcal: nullable(z.number()),
  energy_is_estimated: z.boolean(),
  duration_s: z.number().int(),
  set_count: z.number().int(),
  volume_kg: z.number(),
  exercise_count: z.number().int(),
  updated_at: Timestamp,
});

// ── Exportación ──
export const ExportData = z
  .object({
    format: z.literal('vida-export'),
    format_version: z.literal(1),
    exported_at: Timestamp,
    user_id: Uuid,
    profile: Profile.nullable(),
    preferences: Preferences.nullable(),
    devices: z.array(Device),
    entitlements: z.array(z.record(z.unknown())),
    exercises: z.array(z.record(z.unknown())),
    routines: z.array(RoutineWithItems),
    workout_sessions: z.array(WorkoutSessionWithExercises.extend({ sets: z.array(WorkoutSet) })),
  })
  .passthrough();

// ── Paginación por conjunto de claves (updated_at, id) ──
export const SyncCursor = z.object({ updatedAt: Timestamp, id: Uuid });
export const PageParams = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  after: SyncCursor.optional(),
});

export type ProfileT = z.infer<typeof Profile>;
export type ProfileUpdateT = z.infer<typeof ProfileUpdate>;
export type PreferencesT = z.infer<typeof Preferences>;
export type PreferencesUpdateT = z.infer<typeof PreferencesUpdate>;
export type DeviceT = z.infer<typeof Device>;
export type ExerciseT = z.infer<typeof Exercise>;
export type ExerciseSearchParamsT = z.input<typeof ExerciseSearchParams>;
export type CreateExerciseInputT = z.input<typeof CreateExerciseInput>;
export type RoutineT = z.infer<typeof Routine>;
export type RoutineWithItemsT = z.infer<typeof RoutineWithItems>;
export type SaveRoutinePayloadT = z.input<typeof SaveRoutinePayload>;
export type WorkoutSessionT = z.infer<typeof WorkoutSession>;
export type WorkoutSessionWithExercisesT = z.infer<typeof WorkoutSessionWithExercises>;
export type SessionExerciseT = z.infer<typeof SessionExercise>;
export type WorkoutSetT = z.infer<typeof WorkoutSet>;
export type StartSessionInputT = z.input<typeof StartSessionInput>;
export type RecordSetInputT = z.input<typeof RecordSetInput>;
export type UpdateSetPatchT = z.input<typeof UpdateSetPatch>;
export type TransitionSessionInputT = z.input<typeof TransitionSessionInput>;
export type ExerciseHistoryRowT = z.infer<typeof ExerciseHistoryRow>;
export type PersonalRecordT = z.infer<typeof PersonalRecord>;
export type SessionSummaryT = z.infer<typeof SessionSummary>;
export type ExportDataT = z.infer<typeof ExportData>;
export type SyncCursorT = z.infer<typeof SyncCursor>;
