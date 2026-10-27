-- Fase 2: perfiles, preferencias, dispositivos, entitlements, RLS y exportación
begin;
set local search_path = extensions, public;
select plan(39);

-- Usuarios de prueba
select tests.create_user('a0000000-0000-4000-8000-00000000000a', 'ana@vida.test',
  '{"display_name": "Ana", "time_zone": "America/Argentina/Buenos_Aires", "locale": "es"}');
select tests.create_user('b0000000-0000-4000-8000-00000000000b', 'beto@vida.test',
  '{"time_zone": "No/Existe"}');

-- ── Estructura ──
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS activada en todas las tablas de public');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef),
  0, 'ninguna función de public es SECURITY DEFINER');
select ok(
  (select prosecdef from pg_proc where oid = 'private.handle_new_user()'::regprocedure)
  and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'private.handle_new_user()'::regprocedure),
  'handle_new_user es SECURITY DEFINER con search_path vacío');
select ok(
  not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute')
  and not has_function_privilege('anon', 'private.handle_new_user()', 'execute'),
  'handle_new_user no es ejecutable por clientes');

-- ── Alta de usuario ──
select is((select display_name from public.profiles where user_id = 'a0000000-0000-4000-8000-00000000000a'),
  'Ana', 'el trigger crea el perfil con el nombre de los metadatos');
select is((select time_zone from public.user_preferences where user_id = 'a0000000-0000-4000-8000-00000000000a'),
  'America/Argentina/Buenos_Aires', 'el trigger guarda la zona horaria válida');
select is((select time_zone from public.user_preferences where user_id = 'b0000000-0000-4000-8000-00000000000b'),
  'UTC', 'una zona horaria inválida en el registro cae a UTC');
select is((select weight_unit from public.user_preferences where user_id = 'b0000000-0000-4000-8000-00000000000b'),
  'kg', 'unidad de peso por defecto kg');

-- ── Anónimo ──
select tests.as_anon();
select throws_ok('select * from public.profiles', '42501', null, 'anon no puede leer perfiles');
select throws_ok('select * from public.user_preferences', '42501', null, 'anon no puede leer preferencias');
select throws_ok('select * from public.devices', '42501', null, 'anon no puede leer dispositivos');
select throws_ok('select public.export_my_data()', '42501', null, 'anon no puede exportar datos');
select throws_ok($$select public.has_entitlement('vida_plus')$$, '42501', null, 'anon no puede usar has_entitlement');
reset role;

-- ── Perfiles y preferencias como Ana ──
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.profiles), 1, 'Ana solo ve su perfil');
select is((select count(*)::int from public.user_preferences), 1, 'Ana solo ve sus preferencias');

with u as (update public.profiles set display_name = 'Hackeado'
           where user_id = 'b0000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from u), 0, 'Ana no puede modificar el perfil de Beto');

select throws_ok($$update public.profiles set user_id = 'b0000000-0000-4000-8000-00000000000b'
                   where user_id = 'a0000000-0000-4000-8000-00000000000a'$$,
  'P0001', 'OWNER_IMMUTABLE', 'no se puede reasignar el perfil a otro usuario');
select throws_ok($$update public.user_preferences set time_zone = 'Marte/Olimpo'$$,
  'P0001', 'INVALID_TIME_ZONE', 'zona horaria validada contra pg_timezone_names');
select throws_ok($$update public.user_preferences set weight_unit = 'st'$$,
  '23514', null, 'unidad de peso solo kg|lb');
select lives_ok($$update public.user_preferences set weight_unit = 'lb', week_start = 6$$,
  'Ana puede cambiar sus preferencias');
select throws_ok($$insert into public.profiles (user_id) values ('a0000000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'los clientes no insertan perfiles (los crea el trigger)');
select throws_ok($$delete from public.profiles$$, '42501', null, 'los clientes no borran perfiles');

-- ── Dispositivos ──
select lives_ok($$insert into public.devices (id, kind, platform, label)
                  values ('d0000000-0000-4000-8000-0000000000a1', 'watch', 'wearos', 'Reloj de Ana')$$,
  'Ana registra un dispositivo propio (user_id por defecto = auth.uid())');
select throws_ok($$insert into public.devices (user_id, kind) values ('b0000000-0000-4000-8000-00000000000b', 'web')$$,
  '42501', null, 'Ana no puede crear dispositivos para Beto');
select throws_ok($$insert into public.devices (kind) values ('tostadora')$$,
  '23514', null, 'tipo de dispositivo validado');

-- ── Entitlements ──
select ok((select count(*) from public.entitlements) >= 1, 'el catálogo de entitlements es legible');
select throws_ok($$insert into public.entitlements (code, name) values ('gratis', 'Gratis')$$,
  '42501', null, 'los clientes no escriben el catálogo de entitlements');
select throws_ok($$insert into public.user_entitlements (user_id, entitlement_code)
                   values ('a0000000-0000-4000-8000-00000000000a', 'vida_plus')$$,
  '42501', null, 'un usuario no puede concederse entitlements');
select is(public.has_entitlement('vida_plus'), false, 'sin entitlement concedido, has_entitlement = false');
reset role;

-- Proceso de confianza (service_role) concede el entitlement
select tests.as_service_role();
select lives_ok($$insert into public.user_entitlements (user_id, entitlement_code, source)
                  values ('a0000000-0000-4000-8000-00000000000a', 'vida_plus', 'manual')$$,
  'service_role puede conceder entitlements');
reset role;

select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');
select is(public.has_entitlement('vida_plus'), true, 'Ana tiene vida_plus');
select throws_ok($$update public.user_entitlements set expires_at = null$$,
  '42501', null, 'el usuario no puede modificar sus entitlements');
reset role;

select tests.authenticate_as('b0000000-0000-4000-8000-00000000000b');
select is(public.has_entitlement('vida_plus'), false, 'Beto no hereda el entitlement de Ana');
select is((select count(*)::int from public.user_entitlements), 0, 'Beto no ve los entitlements de Ana');
select is((select count(*)::int from public.devices), 0, 'Beto no ve los dispositivos de Ana');
with d as (delete from public.devices where id = 'd0000000-0000-4000-8000-0000000000a1' returning 1)
select is((select count(*)::int from d), 0, 'Beto no puede borrar el dispositivo de Ana');
reset role;

-- Entitlement vencido
update public.user_entitlements set starts_at = now() - interval '2 days', expires_at = now() - interval '1 day'
 where user_id = 'a0000000-0000-4000-8000-00000000000a';
select tests.authenticate_as('a0000000-0000-4000-8000-00000000000a');
select is(public.has_entitlement('vida_plus'), false, 'un entitlement vencido no cuenta');

-- ── Exportación ──
select is((public.export_my_data() ->> 'user_id')::uuid, 'a0000000-0000-4000-8000-00000000000a'::uuid,
  'export_my_data devuelve los datos de quien llama');
select is(jsonb_array_length(public.export_my_data() -> 'devices'), 1, 'export_my_data incluye solo los dispositivos propios');
reset role;

select * from finish();
rollback;
