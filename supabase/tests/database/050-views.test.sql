-- Fase 3: vistas de historial, récords personales y resumen de sesión
begin;
set local search_path = extensions, public;
select plan(12);

select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'ana@vida.test');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'beto@vida.test');

create temp table t on commit drop as select now() - interval '3 days' as d1, now() - interval '2 days' as d2;
grant select on t to authenticated;

select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');

-- Sesión 1: sentadilla 100×5 (+ calentamiento 60×10); 10 min en pausa; 60 min en total
select public.start_session('50000000-0000-4000-8000-0000000000a1', null, null, (select d1 from t), 'Día 1');
select public.add_session_exercise('5c000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a1',
                                   '6f1c0d2a-3b7e-4c51-9a10-000000000001');
select public.record_set('5e000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-0000000000a1', 0::smallint, 60, 10::smallint,
                         p_set_type => 'warmup', p_client_ts => (select d1 from t) + interval '5 minutes');
select public.record_set('5e000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-0000000000a1', 1::smallint, 100, 5::smallint,
                         p_client_ts => (select d1 from t) + interval '8 minutes');
select public.transition_session('50000000-0000-4000-8000-0000000000a1', 'pause', (select d1 from t) + interval '20 minutes');
select public.transition_session('50000000-0000-4000-8000-0000000000a1', 'resume', (select d1 from t) + interval '30 minutes');
select public.transition_session('50000000-0000-4000-8000-0000000000a1', 'complete', (select d1 from t) + interval '60 minutes');

-- Sesión 2: sentadilla 105×3 y 100×8
select public.start_session('50000000-0000-4000-8000-0000000000a2', null, null, (select d2 from t), 'Día 2');
select public.add_session_exercise('5c000000-0000-4000-8000-0000000000a2', '50000000-0000-4000-8000-0000000000a2',
                                   '6f1c0d2a-3b7e-4c51-9a10-000000000001');
select public.record_set('5e000000-0000-4000-8000-000000000003', '5c000000-0000-4000-8000-0000000000a2', 0::smallint, 105, 3::smallint,
                         p_client_ts => (select d2 from t) + interval '5 minutes');
select public.record_set('5e000000-0000-4000-8000-000000000004', '5c000000-0000-4000-8000-0000000000a2', 1::smallint, 100, 8::smallint,
                         p_client_ts => (select d2 from t) + interval '9 minutes');
select public.transition_session('50000000-0000-4000-8000-0000000000a2', 'complete', (select d2 from t) + interval '45 minutes');

select is((select duration_s from public.session_summaries where id = '50000000-0000-4000-8000-0000000000a1'),
  3000, 'duración neta de pausas (60 min − 10 min)');
select is((select volume_kg from public.session_summaries where id = '50000000-0000-4000-8000-0000000000a1'),
  500.00, 'el volumen excluye el calentamiento');
select is((select set_count from public.session_summaries where id = '50000000-0000-4000-8000-0000000000a1'),
  2, 'conteo de series');
select is((select e1rm_kg from public.exercise_history where set_id = '5e000000-0000-4000-8000-000000000002'),
  116.67, 'e1RM de Epley: 100 × (1 + 5/30)');
select is((select is_weight_pr from public.exercise_history where set_id = '5e000000-0000-4000-8000-000000000003'),
  true, '105 kg supera el máximo anterior: récord de peso');
select is((select is_weight_pr from public.exercise_history where set_id = '5e000000-0000-4000-8000-000000000004'),
  false, '100 kg no es récord de peso');
select is((select is_e1rm_pr from public.exercise_history where set_id = '5e000000-0000-4000-8000-000000000004'),
  true, '100×8 sí es récord de e1RM');
select is((select is_weight_pr from public.exercise_history where set_id = '5e000000-0000-4000-8000-000000000001'),
  false, 'el calentamiento nunca es récord');
select results_eq(
  $$select max_weight_kg, max_reps::int, best_e1rm_kg from public.personal_records
    where exercise_id = '6f1c0d2a-3b7e-4c51-9a10-000000000001'$$,
  $$values (105.00::numeric(6,2), 8, 126.67::numeric)$$,
  'récords personales de sentadilla');

-- Borrar una serie la saca de las métricas (antes de cerrar no es posible; se comprueba con una sesión abierta)
select public.start_session('50000000-0000-4000-8000-0000000000a3', null, null, null, 'Día 3');
select public.add_session_exercise('5c000000-0000-4000-8000-0000000000a3', '50000000-0000-4000-8000-0000000000a3',
                                   '6f1c0d2a-3b7e-4c51-9a10-000000000001');
select public.record_set('5e000000-0000-4000-8000-000000000005', '5c000000-0000-4000-8000-0000000000a3', 0::smallint, 200, 1::smallint);
select public.delete_set('5e000000-0000-4000-8000-000000000005');
select is((select set_count from public.session_summaries where id = '50000000-0000-4000-8000-0000000000a3'),
  0, 'las series borradas no cuentan');
select is((select max_weight_kg from public.personal_records where exercise_id = '6f1c0d2a-3b7e-4c51-9a10-000000000001'),
  105.00::numeric(6,2), 'una sesión en curso no altera los récords');
reset role;

select tests.authenticate_as('b0000000-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.exercise_history) + (select count(*)::int from public.personal_records)
          + (select count(*)::int from public.session_summaries), 0, 'las vistas respetan la RLS: Beto no ve nada de Ana');
reset role;

select * from finish();
rollback;
