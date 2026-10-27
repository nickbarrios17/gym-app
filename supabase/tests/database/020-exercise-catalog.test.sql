-- Fase 3: catálogo de ejercicios del sistema y ejercicios propios
begin;
set local search_path = extensions, public;
select plan(22);

select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'ana@vida.test');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'beto@vida.test');

-- ── Semillas del prototipo ──
select set_eq(
  $$select slug from public.exercises where owner_id is null$$,
  array['sentadilla', 'peso_muerto', 'press_banca', 'press_militar', 'curl'],
  'el catálogo del sistema contiene los cinco ejercicios del prototipo');
select is(
  (select jsonb_array_length(instructions -> 'cues') from public.exercises where slug = 'sentadilla' and owner_id is null),
  4, 'sentadilla tiene sus 4 claves técnicas');
select is(
  (select instructions -> 'cues' -> 0 ->> 'title' from public.exercises where slug = 'sentadilla' and owner_id is null),
  'Pies al ancho de hombros', 'las instrucciones conservan el texto en español del prototipo');
select set_eq(
  $$select muscle_code from public.exercise_muscles m join public.exercises e on e.id = m.exercise_id
    where e.slug = 'press_banca' and m.role = 'primary'$$,
  array['pectorals'], 'músculo principal del press de banca');
select is((select count(*)::int from public.exercise_equipment q join public.exercises e on e.id = q.exercise_id
           where e.slug = 'sentadilla'), 2, 'sentadilla usa barra y rack');

-- ── Lectura y escritura como Ana ──
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.exercises), 5, 'Ana lee el catálogo del sistema');
select ok((select count(*) from public.muscle_groups) > 0 and (select count(*) from public.equipment_types) > 0,
  'Ana lee músculos y equipamiento');
select throws_ok($$insert into public.muscle_groups (code, name_es, region) values ('cuello', 'Cuello', 'core')$$,
  '42501', null, 'los clientes no modifican tablas de consulta');

with u as (update public.exercises set name = 'Sentadilla rota' where owner_id is null returning 1)
select is((select count(*)::int from u), 0, 'Ana no puede modificar ejercicios del sistema');
with d as (delete from public.exercises where owner_id is null returning 1)
select is((select count(*)::int from d), 0, 'Ana no puede borrar ejercicios del sistema');
select throws_ok($$insert into public.exercises (owner_id, slug, name) values (null, 'falso', 'Falso del sistema')$$,
  '42501', null, 'Ana no puede crear ejercicios del sistema');
select throws_ok($$insert into public.exercise_muscles (exercise_id, muscle_code, role)
                   values ('6f1c0d2a-3b7e-4c51-9a10-000000000001', 'calves', 'secondary')$$,
  '42501', null, 'Ana no puede añadir músculos a un ejercicio del sistema');

select lives_ok($$insert into public.exercises (id, owner_id, slug, name, measurement_type, variation_of)
                  values ('e0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a',
                          'sentadilla-bulgara', 'Sentadilla búlgara', 'weight_reps',
                          '6f1c0d2a-3b7e-4c51-9a10-000000000001')$$,
  'Ana crea un ejercicio propio como variación de uno del sistema');
select lives_ok($$insert into public.exercise_muscles (exercise_id, muscle_code, role)
                  values ('e0000000-0000-4000-8000-0000000000a1', 'quads', 'primary')$$,
  'Ana añade músculos a su ejercicio');
select throws_ok($$insert into public.exercises (owner_id, slug, name, measurement_type)
                   values ('a0000000-0000-4000-8000-00000000000a', 'raro', 'Raro', 'peso')$$,
  '23514', null, 'measurement_type validado');
select throws_ok($$update public.exercises set owner_id = 'b0000000-0000-4000-8000-00000000000b'
                   where id = 'e0000000-0000-4000-8000-0000000000a1'$$,
  'P0001', 'OWNER_IMMUTABLE', 'no se puede regalar un ejercicio a otro usuario');
reset role;

-- ── Beto ──
select tests.authenticate_as('b0000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.exercises where id = 'e0000000-0000-4000-8000-0000000000a1'), 0,
  'Beto no ve el ejercicio de Ana');
select is((select count(*)::int from public.exercise_muscles where exercise_id = 'e0000000-0000-4000-8000-0000000000a1'), 0,
  'Beto no ve los músculos del ejercicio de Ana');
select throws_ok($$insert into public.exercise_muscles (exercise_id, muscle_code, role)
                   values ('e0000000-0000-4000-8000-0000000000a1', 'calves', 'secondary')$$,
  '42501', null, 'Beto no puede añadir músculos al ejercicio de Ana');
select throws_ok($$insert into public.exercises (owner_id, slug, name, variation_of)
                   values ('b0000000-0000-4000-8000-00000000000b', 'copia', 'Copia',
                           'e0000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'EXERCISE_NOT_FOUND', 'Beto no puede enlazar una variación al ejercicio de Ana');
select lives_ok($$insert into public.exercises (owner_id, slug, name)
                  values ('b0000000-0000-4000-8000-00000000000b', 'sentadilla-bulgara', 'Mi búlgara')$$,
  'el slug es único por dueño, no global');
with d as (delete from public.exercises where id = 'e0000000-0000-4000-8000-0000000000a1' returning 1)
select is((select count(*)::int from d), 0, 'Beto no puede borrar el ejercicio de Ana');
reset role;

select * from finish();
rollback;
