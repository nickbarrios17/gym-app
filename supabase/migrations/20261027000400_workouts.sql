-- VIDA · Fase 3 — Sesiones de entrenamiento y series
-- Las reglas de integridad (máquina de estados, sesiones cerradas, propiedad) viven en restricciones
-- y triggers, de modo que se cumplen tanto vía RPC como vía acceso directo a tablas.
-- Estados: in_progress ⇄ paused → completed | abandoned (terminales).

create table public.workout_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id          uuid,
  routine_version     integer,
  name                text not null check (char_length(btrim(name)) between 1 and 120),
  status              text not null default 'in_progress'
                      check (status in ('in_progress', 'paused', 'completed', 'abandoned')),
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  paused_at           timestamptz,
  paused_seconds      integer not null default 0 check (paused_seconds >= 0),
  local_date          date not null,
  time_zone           text not null,
  notes               text check (notes is null or char_length(notes) <= 4000),
  tags                text[] not null default '{}' check (cardinality(tags) <= 20),
  device_id           uuid,
  energy_kcal         numeric(7, 1) check (energy_kcal is null or energy_kcal between 0 and 20000),
  energy_is_estimated boolean not null default true,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete set null (routine_id),
  foreign key (device_id, user_id) references public.devices (id, user_id) on delete set null (device_id),
  constraint workout_sessions_status_timestamps check (
       (status = 'in_progress' and ended_at is null and paused_at is null)
    or (status = 'paused' and ended_at is null and paused_at is not null)
    or (status in ('completed', 'abandoned') and ended_at is not null and paused_at is null)
  ),
  check (ended_at is null or ended_at >= started_at),
  check (paused_at is null or paused_at >= started_at),
  check (deleted_at is null or status in ('completed', 'abandoned'))
);
comment on column public.workout_sessions.local_date is 'Fecha local calculada con time_zone al escribir (ADR 0004).';
comment on column public.workout_sessions.energy_kcal is 'Energía ESTIMADA salvo que energy_is_estimated = false.';

-- Como máximo una sesión activa (en curso o pausada) por usuario
create unique index workout_sessions_one_active_idx on public.workout_sessions (user_id)
  where status in ('in_progress', 'paused');
create index workout_sessions_user_sync_idx on public.workout_sessions (user_id, updated_at, id);
create index workout_sessions_user_date_idx on public.workout_sessions (user_id, local_date desc);

create table public.workout_session_exercises (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null,
  user_id        uuid not null default auth.uid(),
  exercise_id    uuid not null references public.exercises (id) deferrable initially deferred, -- ver routine_exercises
  position       integer not null check (position between 0 and 199),
  exercise_name  text not null,
  target_sets    smallint check (target_sets is null or target_sets between 1 and 20),
  rep_min        smallint check (rep_min is null or rep_min between 1 and 100),
  rep_max        smallint check (rep_max is null or rep_max between 1 and 100),
  target_rest_s  integer check (target_rest_s is null or target_rest_s between 0 and 1800),
  target_load_kg numeric(6, 2) check (target_load_kg is null or target_load_kg between 0 and 1000),
  notes          text check (notes is null or char_length(notes) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, session_id, user_id),
  foreign key (session_id, user_id) references public.workout_sessions (id, user_id) on delete cascade,
  constraint workout_session_exercises_position_key unique (session_id, position) deferrable initially deferred
);
comment on table public.workout_session_exercises is 'Copia de los objetivos planificados al iniciar la sesión; editar la rutina no reescribe el historial.';
create index workout_session_exercises_exercise_idx on public.workout_session_exercises (user_id, exercise_id);

create table public.workout_sets (
  id                  uuid primary key,
  user_id             uuid not null default auth.uid(),
  session_id          uuid not null,
  session_exercise_id uuid not null,
  set_index           smallint not null check (set_index between 0 and 99),
  set_type            text not null default 'working' check (set_type in ('warmup', 'working', 'drop', 'failure')),
  weight_kg           numeric(6, 2) check (weight_kg is null or weight_kg between 0 and 1000),
  reps                smallint check (reps is null or reps between 0 and 1000),
  duration_s          integer check (duration_s is null or duration_s between 0 and 86400),
  distance_m          numeric(9, 2) check (distance_m is null or distance_m between 0 and 1000000),
  rpe                 numeric(3, 1) check (rpe is null or (rpe between 1 and 10 and rpe * 2 = floor(rpe * 2))),
  rest_s              integer check (rest_s is null or rest_s between 0 and 3600),
  completed_at        timestamptz,
  client_recorded_at  timestamptz not null,
  device_id           uuid,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (session_id, user_id) references public.workout_sessions (id, user_id) on delete cascade,
  foreign key (session_exercise_id, session_id, user_id)
    references public.workout_session_exercises (id, session_id, user_id) on delete cascade,
  foreign key (device_id, user_id) references public.devices (id, user_id) on delete set null (device_id),
  check (num_nonnulls(weight_kg, reps, duration_s, distance_m) > 0)
);
comment on column public.workout_sets.id is 'UUID generado por el cliente: los reintentos no duplican series.';
create index workout_sets_session_idx on public.workout_sets (session_exercise_id, set_index);
create index workout_sets_user_sync_idx on public.workout_sets (user_id, updated_at, id);

-- ─────────────────────────────────────────────────────────────
-- Reglas de integridad
-- ─────────────────────────────────────────────────────────────
create or replace function private.is_terminal(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_status in ('completed', 'abandoned'); $$;
grant execute on function private.is_terminal(text) to authenticated, service_role;

-- Timestamp efectivo de una operación del cliente: no puede estar en el futuro ni ser demasiado antiguo
create or replace function private.effective_ts(p_client_ts timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_client_ts is null then
    return now();
  end if;
  if p_client_ts > now() + interval '5 minutes' or p_client_ts < now() - interval '14 days' then
    perform private.fail('CLIENT_TS_OUT_OF_RANGE', 'La hora del dispositivo no es válida.');
  end if;
  return least(p_client_ts, now());
end;
$$;
grant execute on function private.effective_ts(timestamptz) to authenticated, service_role;

create or replace function private.workout_sessions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'in_progress' or new.ended_at is not null or new.paused_at is not null
     or new.paused_seconds <> 0 or new.deleted_at is not null then
    perform private.fail('INVALID_TRANSITION', 'Una sesión nueva debe empezar en curso.');
  end if;
  if new.time_zone is null then
    select p.time_zone into new.time_zone from public.user_preferences p where p.user_id = new.user_id;
    new.time_zone := coalesce(new.time_zone, 'UTC');
  end if;
  if not private.is_valid_time_zone(new.time_zone) then
    perform private.fail('INVALID_TIME_ZONE', 'La zona horaria no es válida.');
  end if;
  new.local_date := (new.started_at at time zone new.time_zone)::date;
  return new;
end;
$$;

create or replace function private.workout_sessions_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lifecycle_changed boolean :=
       new.status is distinct from old.status
    or new.ended_at is distinct from old.ended_at
    or new.paused_at is distinct from old.paused_at
    or new.paused_seconds is distinct from old.paused_seconds;
begin
  if new.started_at is distinct from old.started_at
     or new.local_date is distinct from old.local_date
     or new.time_zone is distinct from old.time_zone
     or new.routine_version is distinct from old.routine_version
     or (new.routine_id is distinct from old.routine_id and new.routine_id is not null)
     or (new.device_id is distinct from old.device_id and new.device_id is not null) then
    perform private.fail('IMMUTABLE_FIELD', 'Ese dato de la sesión no se puede modificar.');
  end if;

  if not lifecycle_changed then
    return new;
  end if;

  if private.is_terminal(old.status) then
    perform private.fail('SESSION_CLOSED', 'La sesión ya terminó.');
  end if;

  if new.paused_seconds < old.paused_seconds then
    perform private.fail('INVALID_TRANSITION', 'La duración de pausa no puede disminuir.');
  end if;

  if not (
       (old.status = 'in_progress' and new.status = 'paused' and new.paused_seconds = old.paused_seconds)
    or (old.status = 'paused' and new.status = 'in_progress')
    or (new.status in ('completed', 'abandoned'))
  ) then
    perform private.fail('INVALID_TRANSITION', 'Ese cambio de estado no está permitido.');
  end if;
  return new;
end;
$$;

create trigger workout_sessions_a_before_insert before insert on public.workout_sessions
  for each row execute function private.workout_sessions_before_insert();
create trigger workout_sessions_a_before_update before update on public.workout_sessions
  for each row execute function private.workout_sessions_before_update();
create trigger workout_sessions_set_updated_at before update on public.workout_sessions
  for each row execute function private.set_updated_at();
create trigger workout_sessions_prevent_owner_change before update on public.workout_sessions
  for each row execute function private.prevent_owner_change('user_id');

-- Solo se pueden añadir/modificar ejercicios de sesiones abiertas
create or replace function private.workout_session_exercises_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and (new.session_id is distinct from old.session_id
                           or new.exercise_id is distinct from old.exercise_id) then
    perform private.fail('IMMUTABLE_FIELD', 'Ese dato no se puede modificar.');
  end if;
  select s.status into v_status from public.workout_sessions s where s.id = new.session_id for share;
  if v_status is null then
    perform private.fail('NOT_FOUND', 'La sesión no existe.');
  end if;
  if private.is_terminal(v_status) then
    perform private.fail('SESSION_CLOSED', 'La sesión ya terminó.');
  end if;
  if tg_op = 'INSERT' and not private.exercise_usable_by(new.exercise_id, new.user_id) then
    perform private.fail('EXERCISE_NOT_FOUND', 'El ejercicio no existe o no está disponible.');
  end if;
  return new;
end;
$$;

create trigger workout_session_exercises_a_validate before insert or update on public.workout_session_exercises
  for each row execute function private.workout_session_exercises_validate();
create trigger workout_session_exercises_set_updated_at before update on public.workout_session_exercises
  for each row execute function private.set_updated_at();
create trigger workout_session_exercises_prevent_owner_change before update on public.workout_session_exercises
  for each row execute function private.prevent_owner_change('user_id');

-- Las series solo se escriben en sesiones abiertas (salvo la acción ON DELETE SET NULL del dispositivo)
create or replace function private.workout_sets_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' then
    if new.device_id is null and old.device_id is not null
       and (to_jsonb(new) - 'device_id' - 'updated_at') = (to_jsonb(old) - 'device_id' - 'updated_at') then
      return new;
    end if;
    if new.session_id is distinct from old.session_id
       or new.session_exercise_id is distinct from old.session_exercise_id
       or new.client_recorded_at is distinct from old.client_recorded_at
       or new.device_id is distinct from old.device_id then
      perform private.fail('IMMUTABLE_FIELD', 'Ese dato de la serie no se puede modificar.');
    end if;
  end if;
  select s.status into v_status from public.workout_sessions s where s.id = new.session_id for share;
  if v_status is null then
    perform private.fail('NOT_FOUND', 'La sesión no existe.');
  end if;
  if private.is_terminal(v_status) then
    perform private.fail('SESSION_CLOSED', 'La sesión ya terminó; no se pueden modificar sus series.');
  end if;
  return new;
end;
$$;

create trigger workout_sets_a_validate before insert or update on public.workout_sets
  for each row execute function private.workout_sets_validate();
create trigger workout_sets_set_updated_at before update on public.workout_sets
  for each row execute function private.set_updated_at();
create trigger workout_sets_prevent_owner_change before update on public.workout_sets
  for each row execute function private.prevent_owner_change('user_id');

-- ── Privilegios y RLS ──
-- Sin DELETE para clientes: el historial se borra de forma lógica (deleted_at) o al eliminar la cuenta.
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.workout_sets enable row level security;

revoke all on public.workout_sessions, public.workout_session_exercises, public.workout_sets from anon, authenticated;
grant select, insert, update on public.workout_sessions, public.workout_session_exercises, public.workout_sets to authenticated;

create policy workout_sessions_select_own on public.workout_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy workout_sessions_insert_own on public.workout_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy workout_sessions_update_own on public.workout_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy workout_session_exercises_select_own on public.workout_session_exercises for select to authenticated
  using (user_id = (select auth.uid()));
create policy workout_session_exercises_insert_own on public.workout_session_exercises for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy workout_session_exercises_update_own on public.workout_session_exercises for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy workout_sets_select_own on public.workout_sets for select to authenticated
  using (user_id = (select auth.uid()));
create policy workout_sets_insert_own on public.workout_sets for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy workout_sets_update_own on public.workout_sets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- RPCs idempotentes (SECURITY INVOKER)
-- ─────────────────────────────────────────────────────────────
create or replace function private.session_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(s) || jsonb_build_object(
    'exercises', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.position)
      from public.workout_session_exercises e where e.session_id = s.id
    ), '[]'::jsonb))
  from public.workout_sessions s
  where s.id = p_id;
$$;
grant execute on function private.session_json(uuid) to authenticated, service_role;

-- Inicia una sesión. Reintentar con el mismo id devuelve la sesión existente.
create or replace function public.start_session(
  p_id uuid,
  p_routine_id uuid default null,
  p_device_id uuid default null,
  p_client_ts timestamptz default null,
  p_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_routine public.routines%rowtype;
  v_started timestamptz;
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;
  if p_id is null then
    perform private.fail('VALIDATION_FAILED', 'Falta el identificador de la sesión.');
  end if;

  if exists (select 1 from public.workout_sessions where id = p_id) then
    return private.session_json(p_id);
  end if;

  v_started := private.effective_ts(p_client_ts);

  if exists (select 1 from public.workout_sessions
             where user_id = v_uid and status in ('in_progress', 'paused')) then
    perform private.fail('ACTIVE_SESSION_EXISTS', 'Ya tienes una sesión en curso.');
  end if;

  if p_routine_id is not null then
    select * into v_routine from public.routines where id = p_routine_id and deleted_at is null;
    if not found then
      perform private.fail('NOT_FOUND', 'La rutina no existe.');
    end if;
  end if;

  begin
    insert into public.workout_sessions (id, user_id, routine_id, routine_version, name, started_at, device_id)
    values (p_id, v_uid, p_routine_id, v_routine.version,
            coalesce(nullif(btrim(p_name), ''), v_routine.name, 'Entrenamiento libre'),
            v_started, p_device_id);
  exception when unique_violation then
    -- Carrera con otro reintento o con otra sesión activa
    if exists (select 1 from public.workout_sessions where id = p_id) then
      return private.session_json(p_id);
    elsif exists (select 1 from public.workout_sessions
                  where user_id = v_uid and status in ('in_progress', 'paused')) then
      perform private.fail('ACTIVE_SESSION_EXISTS', 'Ya tienes una sesión en curso.');
    else
      perform private.fail('ID_CONFLICT', 'El identificador ya está en uso.');
    end if;
  end;

  if p_routine_id is not null then
    insert into public.workout_session_exercises
      (session_id, user_id, exercise_id, position, exercise_name, target_sets, rep_min, rep_max, target_rest_s, target_load_kg, notes)
    select p_id, v_uid, i.exercise_id, i.position, e.name, i.target_sets, i.rep_min, i.rep_max, i.target_rest_s, i.target_load_kg, i.notes
    from public.routine_exercises i
    join public.exercises e on e.id = i.exercise_id
    where i.routine_id = p_routine_id;
  end if;

  return private.session_json(p_id);
end;
$$;
revoke all on function public.start_session(uuid, uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.start_session(uuid, uuid, uuid, timestamptz, text) to authenticated;

-- Añade un ejercicio no planificado a una sesión abierta (idempotente por id)
create or replace function public.add_session_exercise(
  p_id uuid,
  p_session_id uuid,
  p_exercise_id uuid,
  p_target_sets smallint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_row jsonb;
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;
  select to_jsonb(e) into v_row from public.workout_session_exercises e where e.id = p_id;
  if v_row is not null then
    return v_row;
  end if;
  if not exists (select 1 from public.workout_sessions where id = p_session_id and deleted_at is null) then
    perform private.fail('NOT_FOUND', 'La sesión no existe.');
  end if;
  select e.name into v_name from public.exercises e where e.id = p_exercise_id;
  if v_name is null then
    perform private.fail('EXERCISE_NOT_FOUND', 'El ejercicio no existe o no está disponible.');
  end if;

  insert into public.workout_session_exercises (id, session_id, user_id, exercise_id, position, exercise_name, target_sets)
  values (p_id, p_session_id, v_uid, p_exercise_id,
          coalesce((select max(position) + 1 from public.workout_session_exercises where session_id = p_session_id), 0),
          v_name, p_target_sets)
  returning to_jsonb(workout_session_exercises.*) into v_row;
  return v_row;
end;
$$;
revoke all on function public.add_session_exercise(uuid, uuid, uuid, smallint) from public, anon;
grant execute on function public.add_session_exercise(uuid, uuid, uuid, smallint) to authenticated;

-- Registra una serie. Idempotente: reintentar con el mismo id devuelve la fila guardada.
create or replace function public.record_set(
  p_id uuid,
  p_session_exercise_id uuid,
  p_set_index smallint,
  p_weight_kg numeric default null,
  p_reps smallint default null,
  p_duration_s integer default null,
  p_distance_m numeric default null,
  p_rpe numeric default null,
  p_rest_s integer default null,
  p_set_type text default 'working',
  p_completed_at timestamptz default null,
  p_client_ts timestamptz default null,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_session uuid;
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;
  if p_id is null then
    perform private.fail('VALIDATION_FAILED', 'Falta el identificador de la serie.');
  end if;

  select to_jsonb(s) into v_row from public.workout_sets s where s.id = p_id;
  if v_row is not null then
    if (v_row ->> 'session_exercise_id')::uuid <> p_session_exercise_id then
      perform private.fail('ID_CONFLICT', 'El identificador ya está en uso.');
    end if;
    return v_row;
  end if;

  select e.session_id into v_session from public.workout_session_exercises e where e.id = p_session_exercise_id;
  if v_session is null then
    perform private.fail('NOT_FOUND', 'El ejercicio de la sesión no existe.');
  end if;

  insert into public.workout_sets
    (id, user_id, session_id, session_exercise_id, set_index, set_type, weight_kg, reps, duration_s,
     distance_m, rpe, rest_s, completed_at, client_recorded_at, device_id)
  values
    (p_id, v_uid, v_session, p_session_exercise_id, p_set_index, coalesce(p_set_type, 'working'), p_weight_kg, p_reps,
     p_duration_s, p_distance_m, p_rpe, p_rest_s,
     least(coalesce(p_completed_at, p_client_ts, now()), now()),
     coalesce(p_client_ts, now()), p_device_id)
  on conflict (id) do nothing
  returning to_jsonb(workout_sets.*) into v_row;

  if v_row is null then
    select to_jsonb(s) into v_row from public.workout_sets s where s.id = p_id;
    if v_row is null then
      perform private.fail('ID_CONFLICT', 'El identificador ya está en uso.');
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function public.record_set(uuid, uuid, smallint, numeric, smallint, integer, numeric, numeric, integer, text, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.record_set(uuid, uuid, smallint, numeric, smallint, integer, numeric, numeric, integer, text, timestamptz, timestamptz, uuid) to authenticated;

-- Modifica una serie de una sesión abierta. p_patch solo admite las claves documentadas; null borra el valor.
create or replace function public.update_set(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_bad text;
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    perform private.fail('VALIDATION_FAILED', 'Los cambios no son válidos.');
  end if;
  select k into v_bad from jsonb_object_keys(p_patch) as k
   where k not in ('set_index', 'set_type', 'weight_kg', 'reps', 'duration_s', 'distance_m', 'rpe', 'rest_s', 'completed_at')
   limit 1;
  if v_bad is not null then
    perform private.fail('VALIDATION_FAILED', 'Campo no permitido.');
  end if;

  update public.workout_sets s set
    set_index    = case when p_patch ? 'set_index' then (p_patch ->> 'set_index')::smallint else s.set_index end,
    set_type     = case when p_patch ? 'set_type' then coalesce(p_patch ->> 'set_type', 'working') else s.set_type end,
    weight_kg    = case when p_patch ? 'weight_kg' then (p_patch ->> 'weight_kg')::numeric else s.weight_kg end,
    reps         = case when p_patch ? 'reps' then (p_patch ->> 'reps')::smallint else s.reps end,
    duration_s   = case when p_patch ? 'duration_s' then (p_patch ->> 'duration_s')::integer else s.duration_s end,
    distance_m   = case when p_patch ? 'distance_m' then (p_patch ->> 'distance_m')::numeric else s.distance_m end,
    rpe          = case when p_patch ? 'rpe' then (p_patch ->> 'rpe')::numeric else s.rpe end,
    rest_s       = case when p_patch ? 'rest_s' then (p_patch ->> 'rest_s')::integer else s.rest_s end,
    completed_at = case when p_patch ? 'completed_at' then (p_patch ->> 'completed_at')::timestamptz else s.completed_at end
  where s.id = p_id and s.deleted_at is null
  returning to_jsonb(s.*) into v_row;

  if v_row is null then
    perform private.fail('NOT_FOUND', 'La serie no existe.');
  end if;
  return v_row;
end;
$$;
revoke all on function public.update_set(uuid, jsonb) from public, anon;
grant execute on function public.update_set(uuid, jsonb) to authenticated;

-- Borrado lógico de una serie. Repetirlo devuelve la fila ya borrada.
create or replace function public.delete_set(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;
  select to_jsonb(s) into v_row from public.workout_sets s where s.id = p_id;
  if v_row is null then
    perform private.fail('NOT_FOUND', 'La serie no existe.');
  end if;
  if v_row ->> 'deleted_at' is not null then
    return v_row;
  end if;
  update public.workout_sets s set deleted_at = now()
   where s.id = p_id
  returning to_jsonb(s.*) into v_row;
  return v_row;
end;
$$;
revoke all on function public.delete_set(uuid) from public, anon;
grant execute on function public.delete_set(uuid) to authenticated;

-- Transiciones: pause | resume | complete | abandon.
-- Repetir la misma transición ya aplicada es un no-op seguro; los estados terminales son finales.
create or replace function public.transition_session(
  p_id uuid,
  p_action text,
  p_client_ts timestamptz default null,
  p_energy_kcal numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.workout_sessions%rowtype;
  v_ts timestamptz;
  v_pause integer := 0;
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;
  if p_action is null or p_action not in ('pause', 'resume', 'complete', 'abandon') then
    perform private.fail('VALIDATION_FAILED', 'Acción no válida.');
  end if;

  select * into v_s from public.workout_sessions where id = p_id and deleted_at is null for update;
  if not found then
    perform private.fail('NOT_FOUND', 'La sesión no existe.');
  end if;

  -- No-ops idempotentes
  if (p_action = 'pause' and v_s.status = 'paused')
     or (p_action = 'resume' and v_s.status = 'in_progress')
     or (p_action = 'complete' and v_s.status = 'completed')
     or (p_action = 'abandon' and v_s.status = 'abandoned') then
    return private.session_json(p_id);
  end if;

  if private.is_terminal(v_s.status) then
    perform private.fail('INVALID_TRANSITION', 'La sesión ya terminó.');
  end if;

  v_ts := greatest(private.effective_ts(p_client_ts), v_s.started_at, coalesce(v_s.paused_at, v_s.started_at));
  if v_s.status = 'paused' then
    v_pause := floor(extract(epoch from (v_ts - v_s.paused_at)))::integer;
  end if;

  if p_action = 'pause' then
    update public.workout_sessions set status = 'paused', paused_at = v_ts where id = p_id;
  elsif p_action = 'resume' then
    update public.workout_sessions
       set status = 'in_progress', paused_at = null, paused_seconds = paused_seconds + v_pause
     where id = p_id;
  else
    update public.workout_sessions
       set status = case p_action when 'complete' then 'completed' else 'abandoned' end,
           ended_at = v_ts,
           paused_at = null,
           paused_seconds = paused_seconds + v_pause,
           energy_kcal = case when p_action = 'complete' and p_energy_kcal is not null then p_energy_kcal else energy_kcal end,
           energy_is_estimated = case when p_action = 'complete' and p_energy_kcal is not null then true else energy_is_estimated end
     where id = p_id;
  end if;

  return private.session_json(p_id);
end;
$$;
revoke all on function public.transition_session(uuid, text, timestamptz, numeric) from public, anon;
grant execute on function public.transition_session(uuid, text, timestamptz, numeric) to authenticated;
