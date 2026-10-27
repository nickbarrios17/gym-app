-- VIDA · Fase 3 — Vistas derivadas y exportación de datos
-- Las métricas (volumen, e1RM de Epley, récords, duración neta) se derivan de los datos registrados;
-- no se persisten. Todas las vistas son security_invoker: respetan la RLS de quien consulta.

-- Historial por serie (sesiones no borradas, series no borradas)
create view public.exercise_history
with (security_invoker = true) as
with base as (
  select
    st.id as set_id,
    st.user_id,
    se.exercise_id,
    se.exercise_name,
    s.id as session_id,
    s.status as session_status,
    s.started_at,
    s.local_date,
    st.set_index,
    st.set_type,
    st.weight_kg,
    st.reps,
    st.duration_s,
    st.distance_m,
    st.rpe,
    st.completed_at,
    case when st.weight_kg is not null and st.reps >= 1 then st.weight_kg * st.reps end as volume_kg,
    case
      when st.weight_kg is null or st.reps is null or st.reps < 1 then null
      when st.reps = 1 then st.weight_kg
      else round(st.weight_kg * (1 + st.reps / 30.0), 2)
    end as e1rm_kg
  from public.workout_sets st
  join public.workout_session_exercises se on se.id = st.session_exercise_id
  join public.workout_sessions s on s.id = st.session_id
  where st.deleted_at is null and s.deleted_at is null
)
select
  b.*,
  -- Récord: supera el máximo de TODAS las sesiones completadas anteriores (series de calentamiento excluidas)
  (b.set_type <> 'warmup' and b.session_status = 'completed' and b.weight_kg is not null and b.weight_kg > coalesce((
     select max(p.weight_kg) from base p
     where p.user_id = b.user_id and p.exercise_id = b.exercise_id and p.set_type <> 'warmup'
       and p.session_status = 'completed' and p.started_at < b.started_at), 0)) as is_weight_pr,
  (b.set_type <> 'warmup' and b.session_status = 'completed' and b.e1rm_kg is not null and b.e1rm_kg > coalesce((
     select max(p.e1rm_kg) from base p
     where p.user_id = b.user_id and p.exercise_id = b.exercise_id and p.set_type <> 'warmup'
       and p.session_status = 'completed' and p.started_at < b.started_at), 0)) as is_e1rm_pr
from base b;

comment on view public.exercise_history is 'Series registradas con volumen y e1RM (Epley: w·(1+reps/30); con 1 repetición, e1RM = peso).';

-- Récords personales por ejercicio (solo sesiones completadas, sin calentamiento)
create view public.personal_records
with (security_invoker = true) as
select
  h.user_id,
  h.exercise_id,
  max(h.exercise_name) as exercise_name,
  max(h.weight_kg) as max_weight_kg,
  max(h.reps) as max_reps,
  max(h.e1rm_kg) as best_e1rm_kg,
  max(h.volume_kg) as best_set_volume_kg,
  count(*) as total_sets,
  max(h.started_at) as last_performed_at
from public.exercise_history h
where h.session_status = 'completed' and h.set_type <> 'warmup'
group by h.user_id, h.exercise_id;

-- Resumen por sesión: duración neta de pausas, volumen, series y ejercicios
create view public.session_summaries
with (security_invoker = true) as
select
  s.id,
  s.user_id,
  s.routine_id,
  s.name,
  s.status,
  s.started_at,
  s.ended_at,
  s.local_date,
  s.time_zone,
  s.notes,
  s.tags,
  s.energy_kcal,
  s.energy_is_estimated,
  greatest(0, floor(
    extract(epoch from (coalesce(s.ended_at, now()) - s.started_at))
    - s.paused_seconds
    - case when s.paused_at is not null then extract(epoch from (now() - s.paused_at)) else 0 end
  ))::integer as duration_s,
  coalesce(agg.set_count, 0)::integer as set_count,
  coalesce(agg.volume_kg, 0) as volume_kg,
  coalesce(agg.exercise_count, 0)::integer as exercise_count,
  s.updated_at
from public.workout_sessions s
left join lateral (
  select
    count(*) as set_count,
    sum(case when st.set_type <> 'warmup' and st.weight_kg is not null and st.reps >= 1 then st.weight_kg * st.reps end) as volume_kg,
    count(distinct st.session_exercise_id) as exercise_count
  from public.workout_sets st
  where st.session_id = s.id and st.deleted_at is null
) agg on true
where s.deleted_at is null;

revoke all on public.exercise_history, public.personal_records, public.session_summaries from anon, authenticated;
grant select on public.exercise_history, public.personal_records, public.session_summaries to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Exportación de datos del usuario (SECURITY INVOKER: la RLS limita el alcance al propio usuario)
-- ─────────────────────────────────────────────────────────────
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED', 'Inicia sesión para continuar.');
  end if;

  return jsonb_build_object(
    'format', 'vida-export',
    'format_version', 1,
    'exported_at', now(),
    'user_id', v_uid,
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = v_uid),
    'preferences', (select to_jsonb(p) from public.user_preferences p where p.user_id = v_uid),
    'devices', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from public.devices d where d.user_id = v_uid), '[]'::jsonb),
    'entitlements', coalesce((select jsonb_agg(to_jsonb(e) order by e.entitlement_code) from public.user_entitlements e where e.user_id = v_uid), '[]'::jsonb),
    'exercises', coalesce((
      select jsonb_agg(to_jsonb(x) || jsonb_build_object(
        'muscles', coalesce((select jsonb_agg(to_jsonb(m)) from public.exercise_muscles m where m.exercise_id = x.id), '[]'::jsonb),
        'equipment', coalesce((select jsonb_agg(q.equipment_code) from public.exercise_equipment q where q.exercise_id = x.id), '[]'::jsonb)
      ) order by x.created_at)
      from public.exercises x where x.owner_id = v_uid), '[]'::jsonb),
    'routines', coalesce((
      select jsonb_agg(private.routine_json(r.id) order by r.created_at)
      from public.routines r where r.user_id = v_uid), '[]'::jsonb),
    'workout_sessions', coalesce((
      select jsonb_agg(private.session_json(s.id) || jsonb_build_object(
        'sets', coalesce((select jsonb_agg(to_jsonb(st) order by st.session_exercise_id, st.set_index, st.client_recorded_at)
                          from public.workout_sets st where st.session_id = s.id), '[]'::jsonb)
      ) order by s.started_at)
      from public.workout_sessions s where s.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
