-- Prepara pgTAP y helpers de prueba. Este archivo NO hace rollback: los helpers quedan disponibles
-- para los demás archivos (se ejecutan en orden alfabético). `supabase db reset` los elimina.
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Crea un usuario en auth.users (dispara handle_new_user)
create or replace function tests.create_user(p_id uuid, p_email text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data, raw_app_meta_data)
  values (p_id, p_email, 'authenticated', 'authenticated', p_meta, '{}'::jsonb);
  return p_id;
end;
$$;

-- Actúa como un usuario autenticado (igual que PostgREST: rol + claims del JWT)
create or replace function tests.authenticate_as(p_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create or replace function tests.as_service_role()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
revoke execute on function tests.create_user(uuid, text, jsonb) from anon, authenticated, service_role;

select plan(1);
select has_function('tests', 'authenticate_as', array['uuid'], 'helpers de prueba instalados');
select * from finish();
