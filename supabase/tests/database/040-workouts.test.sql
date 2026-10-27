-- Fase 3: sesiones, series, idempotencia, máquina de estados e instantáneas del historial
begin;
set local search_path = extensions, public;
select plan(45);

select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'ana@vida.test',
  '{"time_zone": "America/Argentina/Buenos_Aires"}');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'beto@vida.test');

-- Momentos de referencia (now() es constante dentro de la transacción)
create temp table t on commit drop as
select date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - interval '23 hours' as start_ts; -- ayer 01:00 UTC
grant select on t to authenticated;

select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');
insert into public.devices (id, kind, platform) values ('d0000000-0000-4000-8000-0000000000a1', 'watch', 'wearos');
select public.save_routine($${
  "id": "10000000-0000-4000-8000-0000000000a1", "name": "Fuerza A",
  "items": [
    {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000001", "target_sets": 4, "rep_min": 6, "rep_max": 6, "target_load_kg": 100},
    {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000003", "target_sets": 4, "rep_min": 8, "rep_max": 8}
  ]}$$::jsonb, null);

-- ── Inicio ──
create temp table s1 on commit drop as
select public.start_session('50000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1',
                            'd0000000-0000-4000-8000-0000000000a1', (select start_ts from t)) as j;
select is((select j ->> 'status' from s1), 'in_progress', 'start_session crea una sesión en curso');
select is((select j ->> 'name' from s1), 'Fuerza A', 'el nombre se copia de la rutina');
select is((select jsonb_array_length(j -> 'exercises') from s1), 2, 'se copian los objetivos de la rutina');
select is((select (j ->> 'local_date')::date from s1),
          ((select start_ts from t) at time zone 'America/Argentina/Buenos_Aires')::date,
          'local_date usa la zona horaria del usuario');
select isnt((select (j ->> 'local_date')::date from s1), ((select start_ts from t) at time zone 'UTC')::date,
          'a las 01:00 UTC todavía es el día anterior en Buenos Aires');

select is((public.start_session('50000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1') ->> 'id')::uuid,
          '50000000-0000-4000-8000-0000000000a1'::uuid, 'reintentar start_session con el mismo id devuelve la misma sesión');
select is((select count(*)::int from public.workout_sessions), 1, 'el reintento no duplica la sesión');
select is((select count(*)::int from public.workout_session_exercises), 2, 'el reintento no duplica la instantánea');
select throws_ok($$select public.start_session('50000000-0000-4000-8000-0000000000a2', null)$$,
  'P0001', 'ACTIVE_SESSION_EXISTS', 'no se puede iniciar otra sesión con una activa');
select throws_ok($$insert into public.workout_sessions (id, name) values ('50000000-0000-4000-8000-0000000000a3', 'Directa')$$,
  '23505', null, 'el índice parcial impide dos sesiones activas aunque se inserte directo');
select throws_ok($$select public.start_session('50000000-0000-4000-8000-0000000000a4', null, null, now() + interval '1 hour')$$,
  'P0001', 'CLIENT_TS_OUT_OF_RANGE', 'una hora de cliente en el futuro se rechaza');

-- ── Series ──
create temp table se on commit drop as
select (j -> 'exercises' -> 0 ->> 'id')::uuid as squat, (j -> 'exercises' -> 1 ->> 'id')::uuid as bench from s1;
grant select on se to authenticated;

select is((public.record_set('5e000000-0000-4000-8000-000000000001', (select squat from se), 0::smallint, 100, 5::smallint,
          p_client_ts => (select start_ts from t) + interval '5 minutes', p_device_id => 'd0000000-0000-4000-8000-0000000000a1') ->> 'weight_kg')::numeric,
  100::numeric, 'record_set guarda la serie');
select is((public.record_set('5e000000-0000-4000-8000-000000000001', (select squat from se), 0::smallint, 100, 5::smallint) ->> 'id')::uuid,
  '5e000000-0000-4000-8000-000000000001'::uuid, 'reintentar record_set devuelve la fila guardada');
select is((select count(*)::int from public.workout_sets), 1, 'el reintento no duplica la serie');
select throws_ok(format($$select public.record_set('5e000000-0000-4000-8000-000000000001', %L, 1::smallint, 50, 5::smallint)$$, (select bench from se)),
  'P0001', 'ID_CONFLICT', 'reutilizar un id de serie para otro ejercicio se rechaza');
select throws_ok(format($$select public.record_set('5e000000-0000-4000-8000-000000000002', %L, 1::smallint, 100, 5::smallint, p_rpe => 11)$$, (select squat from se)),
  '23514', null, 'RPE fuera de 1–10 se rechaza');
select throws_ok(format($$select public.record_set('5e000000-0000-4000-8000-000000000003', %L, 1::smallint)$$, (select squat from se)),
  '23514', null, 'una serie necesita al menos una métrica');
select lives_ok(format($$select public.record_set('5e000000-0000-4000-8000-000000000004', %L, 1::smallint, 100, 4::smallint)$$, (select squat from se)),
  'segunda serie');

select is((public.update_set('5e000000-0000-4000-8000-000000000004', '{"reps": 5, "rpe": 8.5}') ->> 'reps')::int, 5,
  'update_set corrige una serie de una sesión abierta');
select throws_ok($$select public.update_set('5e000000-0000-4000-8000-000000000004', '{"user_id": "b0000000-0000-4000-8000-00000000000b"}')$$,
  'P0001', 'VALIDATION_FAILED', 'update_set solo acepta campos permitidos');
select throws_ok($$update public.workout_sets set user_id = 'b0000000-0000-4000-8000-00000000000b' where id = '5e000000-0000-4000-8000-000000000004'$$,
  'P0001', 'OWNER_IMMUTABLE', 'no se puede reasignar una serie a otro usuario');
select ok((public.delete_set('5e000000-0000-4000-8000-000000000004') ->> 'deleted_at') is not null, 'delete_set hace borrado lógico');
select ok((public.delete_set('5e000000-0000-4000-8000-000000000004') ->> 'deleted_at') is not null, 'delete_set repetido es idempotente');
select throws_ok($$delete from public.workout_sets$$, '42501', null, 'los clientes no pueden borrar físicamente el historial');

-- ── Instantánea: editar la rutina no reescribe la sesión ──
select lives_ok(format($$select public.save_routine(%L::jsonb, %s)$$,
  '{"id": "10000000-0000-4000-8000-0000000000a1", "name": "Fuerza A editada", "items": [
     {"exercise_id": "6f1c0d2a-3b7e-4c51-9a10-000000000002", "target_sets": 2}]}',
  (select version from public.routines where id = '10000000-0000-4000-8000-0000000000a1')),
  'se edita la rutina mientras hay una sesión');
select is((select target_sets::int from public.workout_session_exercises where id = (select squat from se)), 4,
  'la instantánea conserva los objetivos originales');
select is((select name from public.workout_sessions where id = '50000000-0000-4000-8000-0000000000a1'), 'Fuerza A',
  'la sesión conserva el nombre original');

-- ── Máquina de estados ──
select is(public.transition_session('50000000-0000-4000-8000-0000000000a1', 'pause', (select start_ts from t) + interval '10 minutes') ->> 'status',
  'paused', 'pausar');
select is(public.transition_session('50000000-0000-4000-8000-0000000000a1', 'pause', (select start_ts from t) + interval '12 minutes') ->> 'paused_at',
  (select to_jsonb(paused_at) #>> '{}' from public.workout_sessions where id = '50000000-0000-4000-8000-0000000000a1'),
  'pausar de nuevo es un no-op');
select is((public.transition_session('50000000-0000-4000-8000-0000000000a1', 'resume', (select start_ts from t) + interval '20 minutes') ->> 'paused_seconds')::int,
  600, 'reanudar acumula los segundos en pausa');
select throws_ok($$update public.workout_sessions set status = 'paused' where id = '50000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'pausar sin paused_at viola la coherencia estado/timestamps');
select is(public.transition_session('50000000-0000-4000-8000-0000000000a1', 'complete', (select start_ts from t) + interval '60 minutes', 412) ->> 'status',
  'completed', 'completar');
select is((select energy_is_estimated from public.workout_sessions where id = '50000000-0000-4000-8000-0000000000a1'), true,
  'la energía se marca como estimada');
select is(public.transition_session('50000000-0000-4000-8000-0000000000a1', 'complete') ->> 'status',
  'completed', 'completar de nuevo es un no-op');
select throws_ok($$select public.transition_session('50000000-0000-4000-8000-0000000000a1', 'abandon')$$,
  'P0001', 'INVALID_TRANSITION', 'un estado terminal es final');
select throws_ok($$update public.workout_sessions set status = 'in_progress', ended_at = null where id = '50000000-0000-4000-8000-0000000000a1'$$,
  'P0001', 'SESSION_CLOSED', 'tampoco se puede reabrir por acceso directo');

-- ── Escrituras sobre una sesión cerrada ──
select throws_ok(format($$select public.record_set('5e000000-0000-4000-8000-000000000009', %L, 2::smallint, 100, 5::smallint)$$, (select squat from se)),
  'P0001', 'SESSION_CLOSED', 'no se registran series en una sesión completada');
select is((public.record_set('5e000000-0000-4000-8000-000000000001', (select squat from se), 0::smallint, 100, 5::smallint) ->> 'id')::uuid,
  '5e000000-0000-4000-8000-000000000001'::uuid, 'un reintento tardío de una serie ya guardada sigue siendo idempotente');
select throws_ok($$select public.update_set('5e000000-0000-4000-8000-000000000001', '{"reps": 6}')$$,
  'P0001', 'SESSION_CLOSED', 'no se modifican series de una sesión completada');
select lives_ok($$update public.workout_sessions set notes = 'Buena energía', deleted_at = now() where id = '50000000-0000-4000-8000-0000000000a1'$$,
  'las notas y el borrado lógico de una sesión terminada se permiten');
reset role;

-- ── Beto ──
select tests.authenticate_as('b0000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.workout_sessions) + (select count(*)::int from public.workout_sets), 0,
  'Beto no ve sesiones ni series de Ana');
select throws_ok($$select public.transition_session('50000000-0000-4000-8000-0000000000a1', 'abandon')$$,
  'P0001', 'NOT_FOUND', 'Beto no puede cambiar el estado de la sesión de Ana');
select throws_ok(format($$select public.record_set('5e000000-0000-4000-8000-0000000000b1', %L, 0::smallint, 20, 5::smallint)$$, (select squat from se)),
  'P0001', 'NOT_FOUND', 'Beto no puede registrar series en la sesión de Ana vía RPC');
select throws_ok(format($$insert into public.workout_sets (id, user_id, session_id, session_exercise_id, set_index, reps, client_recorded_at)
                          values ('5e000000-0000-4000-8000-0000000000b2', 'b0000000-0000-4000-8000-00000000000b',
                                  '50000000-0000-4000-8000-0000000000a1', %L, 0, 5, now())$$, (select squat from se)),
  'P0001', 'NOT_FOUND', 'Beto no puede colgar una serie propia de la sesión de Ana (la RLS se la oculta al trigger)');
select throws_ok(format($$insert into public.workout_sets (id, user_id, session_id, session_exercise_id, set_index, reps, client_recorded_at)
                          values ('5e000000-0000-4000-8000-0000000000b3', 'a0000000-0000-4000-8000-00000000000a',
                                  '50000000-0000-4000-8000-0000000000a1', %L, 0, 5, now())$$, (select squat from se)),
  'P0001', 'NOT_FOUND', 'Beto no puede escribir series a nombre de Ana');
reset role;

select * from finish();
rollback;
