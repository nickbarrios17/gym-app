-- Borrado de cuenta: al borrar auth.users (lo hace la Edge Function delete-account con service_role)
-- todos los datos del usuario se eliminan por cascada y los de otros usuarios quedan intactos.
begin;
set local search_path = extensions, public;
select plan(8);

select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'ana@vida.test');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'beto@vida.test');
insert into public.user_entitlements (user_id, entitlement_code) values ('a0000000-0000-4000-8000-00000000000a', 'vida_plus');

-- Ana crea un poco de todo, incluido un ejercicio propio usado en una rutina y en el historial
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');
insert into public.devices (id, kind) values ('d0000000-0000-4000-8000-0000000000a1', 'mobile');
insert into public.exercises (id, owner_id, slug, name)
values ('e0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a', 'hip-thrust', 'Hip thrust');
select public.save_routine($${"id": "10000000-0000-4000-8000-0000000000a1", "name": "Glúteo",
  "items": [{"exercise_id": "e0000000-0000-4000-8000-0000000000a1"}]}$$::jsonb, null);
select public.start_session('50000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1',
                            'd0000000-0000-4000-8000-0000000000a1');
select public.record_set('5e000000-0000-4000-8000-000000000001',
  (select id from public.workout_session_exercises where session_id = '50000000-0000-4000-8000-0000000000a1'),
  0::smallint, 80, 10::smallint, p_device_id => 'd0000000-0000-4000-8000-0000000000a1');
select public.transition_session('50000000-0000-4000-8000-0000000000a1', 'complete');
reset role;

-- Beto también tiene datos
select tests.authenticate_as('b0000000-0000-4000-8000-00000000000b');
select public.save_routine('{"name": "Rutina de Beto"}'::jsonb, null);
select public.start_session('50000000-0000-4000-8000-0000000000b1', null);
reset role;

-- Un ejercicio propio en uso no se puede borrar (FK diferible: se comprueba al confirmar)
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');
savepoint antes_de_borrar_ejercicio;
select lives_ok($$delete from public.exercises where id = 'e0000000-0000-4000-8000-0000000000a1'$$,
  'el borrado se acepta de forma provisional');
select throws_ok('set constraints all immediate', '23503', null,
  'al verificar las restricciones, un ejercicio usado en el historial no se puede borrar');
rollback to savepoint antes_de_borrar_ejercicio;
reset role;

-- Borrar un dispositivo usado en una sesión cerrada solo anula la referencia
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');
select lives_ok($$delete from public.devices where id = 'd0000000-0000-4000-8000-0000000000a1'$$,
  'borrar un dispositivo usado en el historial cerrado funciona (device_id → NULL)');
reset role;

select lives_ok($$delete from auth.users where id = 'a0000000-0000-4000-8000-00000000000a'$$,
  'se puede borrar el usuario de auth');
select lives_ok('set constraints all immediate',
  'las restricciones diferidas se cumplen tras la cascada (equivale a confirmar la transacción)');

select is((
  select (select count(*) from public.profiles where user_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.user_preferences where user_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.devices where user_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.user_entitlements where user_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.exercises where owner_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.routines where user_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.routine_exercises where user_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.workout_sessions where user_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.workout_session_exercises where user_id = 'a0000000-0000-4000-8000-00000000000a')
       + (select count(*) from public.workout_sets where user_id = 'a0000000-0000-4000-8000-00000000000a'))::int,
  0, 'no queda ningún dato de Ana');
select is((select count(*)::int from public.routines where user_id = 'b0000000-0000-4000-8000-00000000000b')
        + (select count(*)::int from public.workout_sessions where user_id = 'b0000000-0000-4000-8000-00000000000b'),
  2, 'los datos de Beto siguen intactos');
select is((select count(*)::int from public.exercises where owner_id is null), 5, 'el catálogo del sistema sigue intacto');

select * from finish();
rollback;
