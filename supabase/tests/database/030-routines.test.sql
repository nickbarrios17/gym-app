-- Fase 3: rutinas, guardado atómico, concurrencia optimista y aislamiento entre usuarios
begin;
set local search_path = extensions, public;
select plan(21);

select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'ana@vida.test');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'beto@vida.test');

-- Ejercicio propio de Beto (para probar referencias cruzadas)
insert into public.exercises (id, owner_id, slug, name)
values ('e0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-00000000000b', 'privado', 'Privado de Beto');

select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');

-- Crear "Fuerza A" como en el prototipo
create temp table r1 on commit drop as
select public.save_routine($${
  "id": "10000000-0000-4000-8000-0000000000a1",
  "name": "Fuerza A",
  "schedule_days": [0, 3],
  "items": [
    {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000001", "target_sets": 4, "rep_min": 6, "rep_max": 6},
    {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000003", "target_sets": 4, "rep_min": 8, "rep_max": 8},
    {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000005", "target_sets": 3, "rep_min": 10, "rep_max": 10}
  ]}$$::jsonb, null) as j;
grant select on r1 to authenticated;

select is((select j ->> 'name' from r1), 'Fuerza A', 'save_routine crea la rutina');
select is((select jsonb_array_length(j -> 'items') from r1), 3, 'save_routine guarda los ejercicios');
select is((select (j -> 'items' -> 2 ->> 'position')::int from r1), 2, 'las posiciones siguen el orden del payload');

-- Reordenar (intercambiar posiciones) con la versión correcta
select lives_ok(format($$select public.save_routine(%L::jsonb, %s)$$,
  '{"id": "10000000-0000-4000-8000-0000000000a1", "name": "Fuerza A", "schedule_days": [0, 3], "items": [
     {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000005", "target_sets": 3},
     {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000001", "target_sets": 4},
     {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000003", "target_sets": 4}]}',
  (select (j ->> 'version')::int from r1)),
  'reordenar ejercicios con la versión esperada funciona');
select lives_ok('set constraints all immediate', 'el orden nuevo cumple la unicidad de posiciones');
select is((select exercise_id from public.routine_exercises
           where routine_id = '10000000-0000-4000-8000-0000000000a1' and position = 0),
  '6f1c0d2a-3b7e-4c51-9a10-000000000005'::uuid, 'el nuevo orden se guarda');

select throws_ok(format($$select public.save_routine(%L::jsonb, %s)$$,
  '{"id": "10000000-0000-4000-8000-0000000000a1", "name": "Edición vieja", "items": []}',
  (select (j ->> 'version')::int from r1)),
  'P0001', 'VERSION_CONFLICT', 'una versión obsoleta se rechaza');
select is((select name from public.routines where id = '10000000-0000-4000-8000-0000000000a1'), 'Fuerza A',
  'la edición rechazada no cambió nada');

select ok((select version from public.routines where id = '10000000-0000-4000-8000-0000000000a1')
          > (select (j ->> 'version')::int from r1), 'la versión aumenta con cada guardado');

select throws_ok($$select public.save_routine('{"name": "Mala", "schedule_days": [7]}'::jsonb, null)$$,
  '23514', null, 'días fuera de 0–6 se rechazan');
select throws_ok($$select public.save_routine('{"name": "Mala", "schedule_days": [1, 1]}'::jsonb, null)$$,
  '23514', null, 'días duplicados se rechazan');
select throws_ok($$select public.save_routine('{"name": "Ajena", "items": [{"exercise_id": "e0000000-0000-4000-8000-0000000000b1"}]}'::jsonb, null)$$,
  'P0001', 'EXERCISE_NOT_FOUND', 'no se puede usar el ejercicio privado de otro usuario');

-- Duplicar
select is((public.duplicate_routine('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2') ->> 'name'),
  'Fuerza A (copia)', 'duplicate_routine crea una copia');
select is((select count(*)::int from public.routine_exercises where routine_id = '10000000-0000-4000-8000-0000000000a2'),
  3, 'la copia incluye los ejercicios');
select is((public.duplicate_routine('10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2') ->> 'id')::uuid,
  '10000000-0000-4000-8000-0000000000a2'::uuid, 'duplicar con el mismo id nuevo es idempotente');
select is((select count(*)::int from public.routines), 2, 'el reintento no creó otra copia');
reset role;

-- ── Beto intenta tocar la rutina de Ana ──
select tests.authenticate_as('b0000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.routines), 0, 'Beto no ve las rutinas de Ana');
select throws_ok($$select public.save_routine('{"id": "10000000-0000-4000-8000-0000000000a1", "name": "Mía"}'::jsonb, 99)$$,
  'P0001', 'NOT_FOUND', 'Beto no puede sobrescribir la rutina de Ana');
select throws_ok($$select public.duplicate_routine('10000000-0000-4000-8000-0000000000a1')$$,
  'P0001', 'NOT_FOUND', 'Beto no puede duplicar la rutina de Ana');
select throws_ok($$insert into public.routine_exercises (routine_id, user_id, exercise_id, position)
                   values ('10000000-0000-4000-8000-0000000000a1', 'b0000000-0000-4000-8000-00000000000b',
                           '6f1c0d2a-3b7e-4c51-9a10-000000000001', 9)$$,
  '23503', null, 'la FK compuesta impide colgar un hijo propio de la rutina de Ana');
select throws_ok($$insert into public.routine_exercises (routine_id, user_id, exercise_id, position)
                   values ('10000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a',
                           '6f1c0d2a-3b7e-4c51-9a10-000000000001', 9)$$,
  '42501', null, 'la RLS impide insertar hijos a nombre de Ana');
reset role;

select * from finish();
rollback;
