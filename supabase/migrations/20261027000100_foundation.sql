-- VIDA · Fase 2 — Base del backend
-- Helpers compartidos, perfiles, preferencias, dispositivos y entitlements (sin facturación).
-- Convenciones (ver docs/adr):
--   * Unidades canónicas: kg, m, s.  * Timestamps en UTC (timestamptz).
--   * IDs UUID v4, generables por el cliente para filas sincronizadas.
--   * Errores de dominio: SQLSTATE P0001, message = CÓDIGO, detail = texto seguro para el usuario.

-- ─────────────────────────────────────────────────────────────
-- Esquema privado para helpers internos (no expuesto por la API)
-- ─────────────────────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Errores de dominio estandarizados { code, message }
create or replace function private.fail(p_code text, p_message text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_message;
end;
$$;
revoke all on function private.fail(text, text) from public;
grant execute on function private.fail(text, text) to authenticated, service_role;

-- updated_at automático
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Impide reasignar un registro a otro dueño. Argumento opcional: nombre de la columna (por defecto user_id).
create or replace function private.prevent_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text := coalesce(tg_argv[0], 'user_id');
begin
  if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
    perform private.fail('OWNER_IMMUTABLE', 'No se puede cambiar el propietario de un registro.');
  end if;
  return new;
end;
$$;

-- Validación de zona horaria IANA contra las zonas que conoce PostgreSQL
create or replace function private.is_valid_time_zone(p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;
grant execute on function private.is_valid_time_zone(text) to authenticated, service_role;

-- Arreglo de días 0–6 (0 = lunes … 6 = domingo) sin duplicados
create or replace function private.is_valid_day_set(p_days smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_days is not null
     and cardinality(p_days) <= 7
     and p_days <@ array[0,1,2,3,4,5,6]::smallint[]
     and cardinality(p_days) = (select count(distinct d) from unnest(p_days) as d);
$$;
grant execute on function private.is_valid_day_set(smallint[]) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Perfiles
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  birth_year       smallint check (birth_year is null or birth_year between 1900 and 2100),
  height_m         numeric(3, 2) check (height_m is null or height_m between 0.50 and 2.80),
  onboarding_state text not null default 'pending'
                   check (onboarding_state in ('pending', 'in_progress', 'completed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.profiles is 'Perfil público mínimo del usuario. Se crea automáticamente al registrarse.';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger profiles_prevent_owner_change before update on public.profiles
  for each row execute function private.prevent_owner_change('user_id');

-- ─────────────────────────────────────────────────────────────
-- Preferencias
-- ─────────────────────────────────────────────────────────────
create table public.user_preferences (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  locale      text not null default 'es' check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  time_zone   text not null default 'UTC',
  week_start  smallint not null default 0 check (week_start between 0 and 6),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on column public.user_preferences.week_start is '0 = lunes … 6 = domingo (misma convención que schedule_days).';

create or replace function private.validate_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_valid_time_zone(new.time_zone) then
    perform private.fail('INVALID_TIME_ZONE', 'La zona horaria no es válida.');
  end if;
  return new;
end;
$$;

create trigger user_preferences_validate before insert or update on public.user_preferences
  for each row execute function private.validate_preferences();
create trigger user_preferences_set_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();
create trigger user_preferences_prevent_owner_change before update on public.user_preferences
  for each row execute function private.prevent_owner_change('user_id');

-- ─────────────────────────────────────────────────────────────
-- Alta de usuario: crea perfil y preferencias
-- SECURITY DEFINER porque se ejecuta desde el esquema auth; search_path vacío y nombres calificados.
-- ─────────────────────────────────────────────────────────────
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := nullif(left(btrim(coalesce(meta ->> 'display_name', '')), 80), '');
  v_tz text := meta ->> 'time_zone';
  v_locale text := meta ->> 'locale';
begin
  if v_tz is null or not private.is_valid_time_zone(v_tz) then
    v_tz := 'UTC';
  end if;
  if v_locale is null or v_locale !~ '^[a-z]{2,3}(-[A-Z]{2})?$' then
    v_locale := 'es';
  end if;

  insert into public.profiles (user_id, display_name) values (new.id, v_name)
    on conflict (user_id) do nothing;
  insert into public.user_preferences (user_id, time_zone, locale) values (new.id, v_tz, v_locale)
    on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Dispositivos (atribución de origen)
-- ─────────────────────────────────────────────────────────────
create table public.devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('web', 'mobile', 'watch')),
  platform     text check (platform is null or char_length(platform) between 1 and 40),
  label        text check (label is null or char_length(label) between 1 and 80),
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);
create index devices_user_idx on public.devices (user_id, updated_at, id);

create trigger devices_set_updated_at before update on public.devices
  for each row execute function private.set_updated_at();
create trigger devices_prevent_owner_change before update on public.devices
  for each row execute function private.prevent_owner_change('user_id');

-- ─────────────────────────────────────────────────────────────
-- Entitlements (preparación para monetización; sin facturación)
-- ─────────────────────────────────────────────────────────────
create table public.entitlements (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  created_at  timestamptz not null default now()
);

create table public.user_entitlements (
  user_id          uuid not null references auth.users (id) on delete cascade,
  entitlement_code text not null references public.entitlements (code) on delete restrict,
  source           text not null default 'manual' check (source in ('manual', 'promo', 'subscription', 'trial')),
  starts_at        timestamptz not null default now(),
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, entitlement_code),
  check (expires_at is null or expires_at > starts_at)
);

create trigger user_entitlements_set_updated_at before update on public.user_entitlements
  for each row execute function private.set_updated_at();

create or replace function public.has_entitlement(p_code text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_entitlements ue
    where ue.user_id = (select auth.uid())
      and ue.entitlement_code = p_code
      and ue.starts_at <= now()
      and (ue.expires_at is null or ue.expires_at > now())
  );
$$;
revoke all on function public.has_entitlement(text) from public, anon;
grant execute on function public.has_entitlement(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Privilegios y RLS (mínimo privilegio; anon no accede a datos privados)
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.devices enable row level security;
alter table public.entitlements enable row level security;
alter table public.user_entitlements enable row level security;

revoke all on public.profiles, public.user_preferences, public.devices,
              public.entitlements, public.user_entitlements from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.user_preferences to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select on public.entitlements to anon, authenticated;
grant select on public.user_entitlements to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy preferences_select_own on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy preferences_update_own on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy devices_select_own on public.devices for select to authenticated
  using (user_id = (select auth.uid()));
create policy devices_insert_own on public.devices for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy devices_update_own on public.devices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy devices_delete_own on public.devices for delete to authenticated
  using (user_id = (select auth.uid()));

create policy entitlements_read_all on public.entitlements for select to anon, authenticated
  using (true);

create policy user_entitlements_select_own on public.user_entitlements for select to authenticated
  using (user_id = (select auth.uid()));
-- Sin políticas de escritura: solo service_role (procesos de confianza) modifica entitlements.
