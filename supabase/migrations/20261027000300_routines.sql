-- VIDA · Fase 3 — Rutinas
-- routines + routine_exercises, con claves compuestas (id, user_id) para impedir mezclar dueños,
-- orden con restricción diferible (reordenar es seguro) y concurrencia optimista por `version`.

create table public.routines (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  notes         text check (notes is null or char_length(notes) <= 2000),
  schedule_days smallint[] not null default '{}' check (private.is_valid_day_set(schedule_days)),
  version       integer not null default 1 check (version >= 1),
  archived_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id)
);
comment on column public.routines.schedule_days is 'Días 0–6 (0 = lunes … 6 = domingo), como en el prototipo (L M X J V S D).';
comment on column public.routines.version is 'Aumenta en cada cambio de la rutina o de sus ejercicios. Usar con save_routine(expected_version).';
create index routines_user_sync_idx on public.routines (user_id, updated_at, id);

create table public.routine_exercises (
  id             uuid primary key default gen_random_uuid(),
  routine_id     uuid not null,
  user_id        uuid not null default auth.uid(),
  -- Diferible: al borrar la cuenta, la cascada elimina ejercicios propios y rutinas en la misma transacción
  exercise_id    uuid not null references public.exercises (id) deferrable initially deferred,
  position       integer not null check (position between 0 and 199),
  target_sets    smallint not null default 3 check (target_sets between 1 and 20),
  rep_min        smallint check (rep_min is null or rep_min between 1 and 100),
  rep_max        smallint check (rep_max is null or rep_max between 1 and 100),
  target_rest_s  integer check (target_rest_s is null or target_rest_s between 0 and 1800),
  target_load_kg numeric(6, 2) check (target_load_kg is null or target_load_kg between 0 and 1000),
  notes          text check (notes is null or char_length(notes) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade,
  constraint routine_exercises_position_key unique (routine_id, position) deferrable initially deferred,
  check (rep_min is null or rep_max is null or rep_max >= rep_min)
);
create index routine_exercises_routine_idx on public.routine_exercises (routine_id, position);
create index routine_exercises_exercise_idx on public.routine_exercises (exercise_id);

-- Cada cambio en la rutina incrementa su versión (no la puede fijar el cliente)
create or replace function private.routines_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger routines_bump_version before update on public.routines
  for each row execute function private.routines_before_update();
create trigger routines_set_updated_at before update on public.routines
  for each row execute function private.set_updated_at();
create trigger routines_prevent_owner_change before update on public.routines
  for each row execute function private.prevent_owner_change('user_id');

-- El ejercicio de una rutina debe ser del sistema o del mismo usuario
create or replace function private.validate_routine_exercise()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.exercise_usable_by(new.exercise_id, new.user_id) then
    perform private.fail('EXERCISE_NOT_FOUND', 'El ejercicio no existe o no está disponible.');
  end if;
  return new;
end;
$$;

create trigger routine_exercises_validate before insert or update on public.routine_exercises
  for each row execute function private.validate_routine_exercise();
create trigger routine_exercises_set_updated_at before update on public.routine_exercises
  for each row execute function private.set_updated_at();
create trigger routine_exercises_prevent_owner_change before update on public.routine_exercises
  for each row execute function private.prevent_owner_change('user_id');

-- Cambios en los ejercicios cuentan como cambio de la rutina (sube la versión una vez por sentencia)
create or replace function private.touch_parent_routine()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.routines r set updated_at = now()
     where r.id in (select distinct o.routine_id from old_rows o);
  else
    update public.routines r set updated_at = now()
     where r.id in (select distinct n.routine_id from new_rows n);
  end if;
  return null;
end;
$$;

create trigger routine_exercises_touch_ins after insert on public.routine_exercises
  referencing new table as new_rows for each statement execute function private.touch_parent_routine();
create trigger routine_exercises_touch_upd after update on public.routine_exercises
  referencing new table as new_rows for each statement execute function private.touch_parent_routine();
create trigger routine_exercises_touch_del after delete on public.routine_exercises
  referencing old table as old_rows for each statement execute function private.touch_parent_routine();

-- ── Privilegios y RLS ──
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;

revoke all on public.routines, public.routine_exercises from anon, authenticated;
grant select, insert, update, delete on public.routines, public.routine_exercises to authenticated;

create policy routines_select_own on public.routines for select to authenticated
  using (user_id = (select auth.uid()));
create policy routines_insert_own on public.routines for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy routines_update_own on public.routines for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy routines_delete_own on public.routines for delete to authenticated
  using (user_id = (select auth.uid()));

create policy routine_exercises_select_own on public.routine_exercises for select to authenticated
  using (user_id = (select auth.uid()));
create policy routine_exercises_insert_own on public.routine_exercises for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy routine_exercises_update_own on public.routine_exercises for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy routine_exercises_delete_own on public.routine_exercises for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- RPCs (SECURITY INVOKER: actúan con los permisos y la RLS del usuario)
-- ─────────────────────────────────────────────────────────────

-- Representación JSON estable de una rutina con sus ejercicios ordenados
create or replace function private.routine_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(r) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.position)
      from public.routine_exercises i where i.routine_id = r.id
    ), '[]'::jsonb))
  from public.routines r
  where r.id = p_id;
$$;
grant execute on function private.routine_json(uuid) to authenticated, service_role;

-- Guarda la rutina completa (cabecera + ejercicios) de forma atómica.
-- p_expected_version NULL = crear. Si la rutina existe, la versión debe coincidir.
create or replace function public.save_routine(p_payload jsonb, p_expected_version integer default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_current public.routines%rowtype;
  v_items jsonb;
  v_days smallint[];
  v_inserted uuid;
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    perform private.fail('VALIDATION_FAILED', 'Los datos de la rutina no son válidos.');
  end if;

  v_id := coalesce((p_payload ->> 'id')::uuid, gen_random_uuid());
  v_items := coalesce(p_payload -> 'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 50 then
    perform private.fail('VALIDATION_FAILED', 'La lista de ejercicios no es válida.');
  end if;
  if p_payload ? 'schedule_days' then
    if jsonb_typeof(p_payload -> 'schedule_days') <> 'array' then
      perform private.fail('VALIDATION_FAILED', 'Los días de la rutina no son válidos.');
    end if;
    select coalesce(array_agg(d::smallint), '{}') into v_days
      from jsonb_array_elements_text(p_payload -> 'schedule_days') as d;
  else
    v_days := '{}';
  end if;

  select * into v_current from public.routines where id = v_id for update;

  if not found then
    if p_expected_version is not null then
      perform private.fail('NOT_FOUND', 'La rutina no existe.');
    end if;
    insert into public.routines (id, user_id, name, notes, schedule_days)
    values (v_id, v_uid, p_payload ->> 'name', p_payload ->> 'notes', v_days)
    on conflict (id) do nothing
    returning id into v_inserted;
    if v_inserted is null then
      -- El id existe pero no es visible para este usuario
      perform private.fail('NOT_FOUND', 'La rutina no existe.');
    end if;
  else
    if v_current.deleted_at is not null then
      perform private.fail('NOT_FOUND', 'La rutina no existe.');
    end if;
    if p_expected_version is null or v_current.version <> p_expected_version then
      perform private.fail('VERSION_CONFLICT', 'La rutina cambió en otro dispositivo. Recarga y vuelve a intentarlo.');
    end if;
    update public.routines
       set name = p_payload ->> 'name',
           notes = p_payload ->> 'notes',
           schedule_days = v_days
     where id = v_id;
    delete from public.routine_exercises where routine_id = v_id;
  end if;

  insert into public.routine_exercises
    (id, routine_id, user_id, exercise_id, position, target_sets, rep_min, rep_max, target_rest_s, target_load_kg, notes)
  select coalesce((it ->> 'id')::uuid, gen_random_uuid()),
         v_id, v_uid,
         (it ->> 'exercise_id')::uuid,
         (ord - 1)::integer,
         coalesce((it ->> 'target_sets')::smallint, 3),
         (it ->> 'rep_min')::smallint,
         (it ->> 'rep_max')::smallint,
         (it ->> 'target_rest_s')::integer,
         (it ->> 'target_load_kg')::numeric,
         it ->> 'notes'
  from jsonb_array_elements(v_items) with ordinality as t(it, ord);

  return private.routine_json(v_id);
end;
$$;
revoke all on function public.save_routine(jsonb, integer) from public, anon;
grant execute on function public.save_routine(jsonb, integer) to authenticated;

-- Duplica una rutina propia (con sus ejercicios). p_new_id permite que el cliente genere el UUID.
create or replace function public.duplicate_routine(p_id uuid, p_new_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_src public.routines%rowtype;
  v_new uuid := coalesce(p_new_id, gen_random_uuid());
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;

  if exists (select 1 from public.routines where id = v_new) then
    -- Reintento idempotente: la copia ya existe
    return private.routine_json(v_new);
  end if;

  select * into v_src from public.routines where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('NOT_FOUND', 'La rutina no existe.');
  end if;

  insert into public.routines (id, user_id, name, notes, schedule_days)
  values (v_new, v_uid, left(v_src.name || ' (copia)', 80), v_src.notes, v_src.schedule_days);

  insert into public.routine_exercises
    (routine_id, user_id, exercise_id, position, target_sets, rep_min, rep_max, target_rest_s, target_load_kg, notes)
  select v_new, v_uid, exercise_id, position, target_sets, rep_min, rep_max, target_rest_s, target_load_kg, notes
  from public.routine_exercises where routine_id = p_id;

  return private.routine_json(v_new);
end;
$$;
revoke all on function public.duplicate_routine(uuid, uuid) from public, anon;
grant execute on function public.duplicate_routine(uuid, uuid) to authenticated;
