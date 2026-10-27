// Edge Function: elimina la cuenta del usuario que llama y, por cascada (FK ON DELETE CASCADE), todos sus datos.
// - Valida el JWT del usuario contra Supabase Auth (no basta con decodificarlo).
// - La clave service_role solo se lee de variables de entorno del servidor; nunca llega al cliente.
// - Respuestas de error con el formato estándar { code, message }, sin detalles internos.
import { createClient } from 'npm:@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export type Env = (name: string) => string | undefined;

export async function handleDeleteAccount(req: Request, env: Env = (n) => Deno.env.get(n)): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply(405, { code: 'VALIDATION_FAILED', message: 'Método no permitido.' });

  const url = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    console.error('delete-account: faltan variables de entorno');
    return reply(500, { code: 'UNKNOWN', message: 'Algo salió mal. Inténtalo de nuevo.' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return reply(401, { code: 'NOT_AUTHENTICATED', message: 'Inicia sesión para continuar.' });
  }

  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // cuerpo vacío o inválido: se trata como falta de confirmación
  }
  if (body.confirm !== true) {
    return reply(400, { code: 'VALIDATION_FAILED', message: 'Confirma que quieres eliminar tu cuenta.' });
  }

  // Valida el token con Auth y obtiene el usuario real (el id nunca viene del cuerpo de la petición)
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(authHeader.slice('Bearer '.length));
  if (userError || !userData.user) {
    return reply(401, { code: 'NOT_AUTHENTICATED', message: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    console.error('delete-account: fallo al eliminar', { userId: userData.user.id, status: deleteError.status });
    return reply(500, { code: 'UNKNOWN', message: 'No se pudo eliminar la cuenta. Inténtalo de nuevo.' });
  }

  return reply(200, { ok: true });
}

if (import.meta.main) Deno.serve((req) => handleDeleteAccount(req));
