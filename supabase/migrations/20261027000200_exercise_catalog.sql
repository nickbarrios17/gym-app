-- VIDA · Fase 3 — Catálogo de ejercicios
-- Tablas de consulta globales (grupos musculares, equipamiento) y ejercicios del sistema/usuario.
-- Las filas del sistema (owner_id NULL) solo cambian mediante migraciones o procesos de confianza.

create table public.muscle_groups (
  code    text primary key check (code ~ '^[a-z]+(-[a-z]+)*$'),
  name_es text not null,
  region  text not null check (region in ('legs', 'back', 'chest', 'shoulders', 'arms', 'core'))
);

create table public.equipment_types (
  code    text primary key check (code ~ '^[a-z]+(-[a-z]+)*$'),
  name_es text not null
);

create table public.exercises (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid references auth.users (id) on delete cascade,
  slug             text not null check (slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$' and char_length(slug) <= 80),
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  short_name       text check (short_name is null or char_length(btrim(short_name)) between 1 and 40),
  description      text check (description is null or char_length(description) <= 2000),
  category         text not null default 'strength'
                   check (category in ('strength', 'cardio', 'mobility', 'stretching', 'plyometrics')),
  body_part        text check (body_part is null or body_part in ('legs', 'back', 'chest', 'shoulders', 'arms', 'core', 'cardio', 'full_body')),
  measurement_type text not null default 'weight_reps'
                   check (measurement_type in ('weight_reps', 'reps', 'duration', 'distance_duration')),
  met              numeric(4, 2) check (met is null or met between 1 and 25),
  instructions     jsonb not null default '{}'::jsonb check (jsonb_typeof(instructions) = 'object'),
  media            jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  variation_of     uuid references public.exercises (id) on delete set null,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint exercises_owner_slug_key unique nulls not distinct (owner_id, slug),
  check (variation_of is null or variation_of <> id)
);
comment on column public.exercises.owner_id is 'NULL = ejercicio del catálogo del sistema (solo lectura para clientes).';
comment on column public.exercises.met is 'MET aproximado usado solo para ESTIMAR calorías.';
create index exercises_owner_idx on public.exercises (owner_id, updated_at, id);
create index exercises_name_idx on public.exercises (lower(name));

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_code text not null references public.muscle_groups (code) on delete restrict,
  role        text not null check (role in ('primary', 'secondary')),
  primary key (exercise_id, muscle_code)
);
create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_code);

create table public.exercise_equipment (
  exercise_id    uuid not null references public.exercises (id) on delete cascade,
  equipment_code text not null references public.equipment_types (code) on delete restrict,
  primary key (exercise_id, equipment_code)
);
create index exercise_equipment_equipment_idx on public.exercise_equipment (equipment_code);

-- Una variación solo puede apuntar a un ejercicio del sistema o del mismo dueño
create or replace function private.validate_exercise()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.variation_of is not null and not exists (
    select 1 from public.exercises e
    where e.id = new.variation_of
      and (e.owner_id is null or e.owner_id is not distinct from new.owner_id)
  ) then
    perform private.fail('EXERCISE_NOT_FOUND', 'El ejercicio base no existe.');
  end if;
  return new;
end;
$$;

create trigger exercises_validate before insert or update on public.exercises
  for each row execute function private.validate_exercise();
create trigger exercises_set_updated_at before update on public.exercises
  for each row execute function private.set_updated_at();
create trigger exercises_prevent_owner_change before update on public.exercises
  for each row execute function private.prevent_owner_change('owner_id');

-- Helper: ¿el ejercicio es del sistema o del usuario indicado?
create or replace function private.exercise_usable_by(p_exercise_id uuid, p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.exercises e
    where e.id = p_exercise_id and (e.owner_id is null or e.owner_id = p_user_id)
  );
$$;
grant execute on function private.exercise_usable_by(uuid, uuid) to authenticated, service_role;

-- ── Privilegios y RLS ──
alter table public.muscle_groups enable row level security;
alter table public.equipment_types enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.exercise_equipment enable row level security;

revoke all on public.muscle_groups, public.equipment_types, public.exercises,
              public.exercise_muscles, public.exercise_equipment from anon, authenticated;

grant select on public.muscle_groups, public.equipment_types to authenticated;
grant select, insert, update, delete on public.exercises, public.exercise_muscles, public.exercise_equipment to authenticated;

create policy muscle_groups_read on public.muscle_groups for select to authenticated using (true);
create policy equipment_types_read on public.equipment_types for select to authenticated using (true);

create policy exercises_select on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy exercises_insert_own on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy exercises_update_own on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy exercises_delete_own on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy exercise_muscles_select on public.exercise_muscles for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id
                 and (e.owner_id is null or e.owner_id = (select auth.uid()))));
create policy exercise_muscles_write_own on public.exercise_muscles for all to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

create policy exercise_equipment_select on public.exercise_equipment for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id
                 and (e.owner_id is null or e.owner_id = (select auth.uid()))));
create policy exercise_equipment_write_own on public.exercise_equipment for all to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.owner_id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────
-- Datos del catálogo (necesarios también en producción)
-- Etiquetas en español tomadas de la app actual (app.js: MU, EQN; mannequin.js: MUS).
-- ─────────────────────────────────────────────────────────────
insert into public.muscle_groups (code, name_es, region) values
  ('quads', 'Cuádriceps', 'legs'),
  ('hamstrings', 'Isquiotibiales', 'legs'),
  ('glutes', 'Glúteos', 'legs'),
  ('calves', 'Gemelos', 'legs'),
  ('abductors', 'Abductores', 'legs'),
  ('adductors', 'Aductores', 'legs'),
  ('abs', 'Abdomen', 'core'),
  ('spine', 'Lumbares', 'back'),
  ('lats', 'Dorsales', 'back'),
  ('traps', 'Trapecio', 'back'),
  ('upper-back', 'Espalda alta', 'back'),
  ('levator-scapulae', 'Elevador de la escápula', 'back'),
  ('pectorals', 'Pectorales', 'chest'),
  ('serratus-anterior', 'Serrato anterior', 'chest'),
  ('delts', 'Deltoides', 'shoulders'),
  ('biceps', 'Bíceps', 'arms'),
  ('triceps', 'Tríceps', 'arms'),
  ('forearms', 'Antebrazos', 'arms');

insert into public.equipment_types (code, name_es) values
  ('barbell', 'Barra'),
  ('plates', 'Discos'),
  ('rack', 'Rack'),
  ('bench', 'Banco'),
  ('dumbbell', 'Mancuerna'),
  ('cable', 'Polea'),
  ('machine', 'Máquina'),
  ('bodyweight', 'Peso corporal'),
  ('kettlebell', 'Kettlebell'),
  ('band', 'Banda'),
  ('ez-bar', 'Barra EZ'),
  ('smith', 'Smith'),
  ('lever', 'Palanca'),
  ('other', 'Otro');

-- Los cinco ejercicios del prototipo, con su contenido en español tal cual aparece en app.js (EX).
-- Roles muscular: «primary» = activación 1 en mannequin.js; el resto de la ficha es «secondary».
-- No hay descripción en el prototipo, por eso description queda NULL.
insert into public.exercises (id, owner_id, slug, name, short_name, category, body_part, measurement_type, met, instructions, media) values
('6f1c0d2a-3b7e-4c51-9a10-000000000001', null, 'sentadilla', 'Sentadilla con barra', 'Sentadilla', 'strength', 'legs', 'weight_reps', 6,
 $j${
  "level": "Intermedio",
  "tempo": "3 s bajada · 1 s subida",
  "cues": [
    {"title": "Pies al ancho de hombros", "detail": "Puntas abiertas 15–30°. Aprieta la barra contra la espalda alta antes de sacarla del rack."},
    {"title": "Cadera y rodilla a la vez", "detail": "Las rodillas siguen la dirección de los pies; no dejes que caigan hacia adentro."},
    {"title": "Baja a paralelo o más", "detail": "La cadera llega a la altura de la rodilla con el pecho arriba y la espalda neutra."},
    {"title": "Empuja el suelo", "detail": "Peso en todo el pie; cadera y pecho suben al mismo ritmo."}
  ],
  "errors": [
    {"title": "Rodillas hacia adentro", "fix": "Piensa en «abrir el suelo» con los pies durante la subida."},
    {"title": "Talones despegados", "fix": "Trabaja movilidad de tobillo o usa calzado con tacón."},
    {"title": "Espalda baja que se redondea", "fix": "Baja solo hasta donde mantienes la columna neutra."}
  ],
  "breathing": ["Inhala profundo arriba y bloquea el abdomen", "Mantén el aire durante la bajada", "Exhala al superar el punto más difícil de la subida"]
 }$j$::jsonb,
 '[{"type": "animation_3d", "key": "squat"}]'::jsonb),
('6f1c0d2a-3b7e-4c51-9a10-000000000002', null, 'peso_muerto', 'Peso muerto', 'Peso muerto', 'strength', 'back', 'weight_reps', 6,
 $j${
  "level": "Intermedio",
  "tempo": "1 s subida · 2 s bajada",
  "cues": [
    {"title": "Barra sobre el medio del pie", "detail": "Espinillas a 2–3 cm de la barra antes de agacharte."},
    {"title": "Bisagra de cadera", "detail": "Lleva la cadera atrás hasta agarrar la barra con los brazos rectos."},
    {"title": "Saca la holgura", "detail": "Tensa los dorsales y tira de la barra sin despegarla todavía."},
    {"title": "Empuja y extiende", "detail": "Empuja el suelo con las piernas y termina con la cadera, sin hiperextender."}
  ],
  "errors": [
    {"title": "Barra lejos del cuerpo", "fix": "Rózala por las piernas durante todo el recorrido."},
    {"title": "La cadera sube primero", "fix": "Cadera y hombros deben subir juntos al despegar."},
    {"title": "Tirar con los brazos", "fix": "Los brazos son ganchos: no flexiones los codos."}
  ],
  "breathing": ["Inhala y tensa el core antes de cada repetición", "Aguanta el aire al despegar la barra", "Exhala arriba, con la cadera bloqueada"]
 }$j$::jsonb,
 '[{"type": "animation_3d", "key": "deadlift"}]'::jsonb),
('6f1c0d2a-3b7e-4c51-9a10-000000000003', null, 'press_banca', 'Press de banca', 'Press banca', 'strength', 'chest', 'weight_reps', 5,
 $j${
  "level": "Principiante",
  "tempo": "2 s bajada · 1 s subida",
  "cues": [
    {"title": "Escápulas atrás y abajo", "detail": "Crea un arco natural y apoya firme la espalda alta."},
    {"title": "Agarre algo más ancho que los hombros", "detail": "Muñecas rectas, la barra sobre el talón de la mano."},
    {"title": "Baja a la parte baja del pecho", "detail": "Codos a 45–60° del torso, no abiertos a 90°."},
    {"title": "Empuja hacia atrás y arriba", "detail": "La barra vuelve a la línea de los hombros."}
  ],
  "errors": [
    {"title": "Rebotar en el pecho", "fix": "Toca suave y controla la transición."},
    {"title": "Glúteos que se levantan", "fix": "Pies firmes y cadera pegada al banco."},
    {"title": "Codos muy abiertos", "fix": "Estresa el hombro: ciérralos ligeramente."}
  ],
  "breathing": ["Inhala al bajar la barra", "Mantén la tensión abajo", "Exhala al empujar"]
 }$j$::jsonb,
 '[{"type": "animation_3d", "key": "bench"}]'::jsonb),
('6f1c0d2a-3b7e-4c51-9a10-000000000004', null, 'press_militar', 'Press militar', 'Press militar', 'strength', 'shoulders', 'weight_reps', 5,
 $j${
  "level": "Intermedio",
  "tempo": "1 s subida · 2 s bajada",
  "cues": [
    {"title": "Barra sobre las clavículas", "detail": "Codos ligeramente por delante de la barra."},
    {"title": "Glúteos y abdomen apretados", "detail": "Evita arquear la zona lumbar."},
    {"title": "Aparta la cabeza", "detail": "Retrae el mentón y empuja en línea recta."},
    {"title": "Bloquea arriba", "detail": "Barra sobre el medio del pie, cabeza «a través de la ventana»."}
  ],
  "errors": [
    {"title": "Arquear la zona lumbar", "fix": "Aprieta glúteos y reduce el peso."},
    {"title": "Barra que se va adelante", "fix": "Trayectoria vertical, pegada a la cara."},
    {"title": "Impulso de piernas", "fix": "Eso es push press: rodillas fijas."}
  ],
  "breathing": ["Inhala abajo y bloquea el core", "Exhala al pasar la frente", "Vuelve a inhalar arriba antes de bajar"]
 }$j$::jsonb,
 '[{"type": "animation_3d", "key": "ohp"}]'::jsonb),
('6f1c0d2a-3b7e-4c51-9a10-000000000005', null, 'curl', 'Curl con barra', 'Curl', 'strength', 'arms', 'weight_reps', 3.5,
 $j${
  "level": "Principiante",
  "tempo": "1 s subida · 3 s bajada",
  "cues": [
    {"title": "Codos pegados al torso", "detail": "Fíjalos a los costados durante todo el movimiento."},
    {"title": "Sube sin balancear", "detail": "El torso no se mueve; solo trabaja el codo."},
    {"title": "Aprieta arriba", "detail": "Pausa breve con el bíceps contraído."},
    {"title": "Baja controlado", "detail": "Extiende casi por completo sin perder tensión."}
  ],
  "errors": [
    {"title": "Balancear el cuerpo", "fix": "Reduce el peso o apoya la espalda en una pared."},
    {"title": "Codos que avanzan", "fix": "Convierte el curl en un ejercicio de hombro."},
    {"title": "Recorrido corto", "fix": "Baja hasta casi extender el brazo."}
  ],
  "breathing": ["Exhala al subir", "Inhala al bajar"]
 }$j$::jsonb,
 '[{"type": "animation_3d", "key": "curl"}]'::jsonb);

insert into public.exercise_muscles (exercise_id, muscle_code, role) values
  ('6f1c0d2a-3b7e-4c51-9a10-000000000001', 'quads', 'primary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000001', 'glutes', 'primary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000001', 'abs', 'secondary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000002', 'hamstrings', 'primary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000002', 'glutes', 'primary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000002', 'spine', 'primary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000003', 'pectorals', 'primary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000003', 'triceps', 'secondary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000003', 'delts', 'secondary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000004', 'delts', 'primary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000004', 'triceps', 'secondary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000004', 'abs', 'secondary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000005', 'biceps', 'primary'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000005', 'forearms', 'secondary');

insert into public.exercise_equipment (exercise_id, equipment_code) values
  ('6f1c0d2a-3b7e-4c51-9a10-000000000001', 'barbell'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000001', 'rack'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000002', 'barbell'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000002', 'plates'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000003', 'barbell'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000003', 'bench'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000004', 'barbell'),
  ('6f1c0d2a-3b7e-4c51-9a10-000000000005', 'barbell');
