// Pruebas del handler con un servidor de Auth SIMULADO (no requiere Supabase).
// Ejecutar: deno test --allow-net --allow-env supabase/functions/delete-account/index.test.ts
import { handleDeleteAccount } from './index.ts';

const assertEquals = (a: unknown, b: unknown, msg?: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ?? 'assertEquals'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

const USER_ID = 'a0000000-0000-4000-8000-00000000000a';
const GOOD_TOKEN = 'token-valido';

/** Simula GoTrue: GET /auth/v1/user y DELETE /auth/v1/admin/users/:id */
function fakeAuth() {
  const deleted: { id: string; auth: string | null }[] = [];
  const server = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, (req) => {
    const u = new URL(req.url);
    if (req.method === 'GET' && u.pathname === '/auth/v1/user') {
      return req.headers.get('Authorization') === `Bearer ${GOOD_TOKEN}`
        ? Response.json({ id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'ana@vida.test' })
        : Response.json({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }, { status: 401 });
    }
    const m = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(u.pathname);
    if (req.method === 'DELETE' && m) {
      deleted.push({ id: m[1]!, auth: req.headers.get('Authorization') });
      return Response.json({});
    }
    return new Response('not found', { status: 404 });
  });
  const url = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  const env = (n: string) => ({ SUPABASE_URL: url, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service-secreta' })[n];
  return { server, env, deleted };
}

const post = (body: unknown, token?: string) =>
  new Request('http://function.local/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

Deno.test('rechaza métodos distintos de POST', async () => {
  const r = await handleDeleteAccount(new Request('http://function.local', { method: 'GET' }), () => 'x');
  assertEquals(r.status, 405);
});

Deno.test('sin token devuelve NOT_AUTHENTICATED y no borra nada', async () => {
  const a = fakeAuth();
  try {
    const r = await handleDeleteAccount(post({ confirm: true }), a.env);
    assertEquals(r.status, 401);
    assertEquals((await r.json()).code, 'NOT_AUTHENTICATED');
    assertEquals(a.deleted.length, 0);
  } finally {
    await a.server.shutdown();
  }
});

Deno.test('exige confirmación explícita', async () => {
  const a = fakeAuth();
  try {
    const r = await handleDeleteAccount(post({}, GOOD_TOKEN), a.env);
    assertEquals(r.status, 400);
    assertEquals(a.deleted.length, 0);
  } finally {
    await a.server.shutdown();
  }
});

Deno.test('un token inválido no borra nada', async () => {
  const a = fakeAuth();
  try {
    const r = await handleDeleteAccount(post({ confirm: true }, 'token-falso'), a.env);
    assertEquals(r.status, 401);
    assertEquals(a.deleted.length, 0);
  } finally {
    await a.server.shutdown();
  }
});

Deno.test('borra SOLO al usuario del token, con la clave de servicio, ignorando ids del cuerpo', async () => {
  const a = fakeAuth();
  try {
    const r = await handleDeleteAccount(post({ confirm: true, user_id: 'b0000000-0000-4000-8000-00000000000b' }, GOOD_TOKEN), a.env);
    assertEquals(r.status, 200);
    assertEquals(a.deleted, [{ id: USER_ID, auth: 'Bearer service-secreta' }]);
  } finally {
    await a.server.shutdown();
  }
});

Deno.test('sin variables de entorno responde un error genérico sin detalles', async () => {
  const r = await handleDeleteAccount(post({ confirm: true }, GOOD_TOKEN), () => undefined);
  assertEquals(r.status, 500);
  assertEquals(await r.json(), { code: 'UNKNOWN', message: 'Algo salió mal. Inténtalo de nuevo.' });
});
