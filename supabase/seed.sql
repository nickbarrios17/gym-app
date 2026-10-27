-- Datos SOLO para desarrollo local (se cargan con `supabase db reset`).
-- El catálogo de ejercicios, músculos y equipamiento vive en las migraciones porque también se necesita en producción.
-- No se crean usuarios aquí: las pruebas crean los suyos y la app usa el registro normal (correo vía Mailpit).

-- Entitlement de ejemplo para probar has_entitlement(); la facturación real está fuera de alcance (Fase 7).
insert into public.entitlements (code, name, description)
values ('vida_plus', 'VIDA Plus', 'Entitlement de ejemplo para desarrollo. Sin facturación asociada.')
on conflict (code) do nothing;
