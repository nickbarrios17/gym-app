import { describe, expect, it } from 'vitest';
import { Outbox, createKeyValueOutboxStorage, createMemoryOutboxStorage, type OutboxOp } from '../src/outbox';

const sid = '50000000-0000-4000-8000-0000000000a1';
const se = '5c000000-0000-4000-8000-0000000000a1';
const set = (n: number): OutboxOp => ({
  kind: 'record_set',
  input: { id: `5e000000-0000-4000-8000-00000000000${n}`, sessionExerciseId: se, setIndex: n, weightKg: 100, reps: 5 },
});

/** Servidor simulado: idempotente por id, como las RPC reales. */
const fakeServer = () => {
  const rows = new Map<string, OutboxOp>();
  let online = true;
  let closed = false;
  const calls: string[] = [];
  return {
    calls,
    rows,
    setOnline: (v: boolean) => (online = v),
    close: () => (closed = true),
    execute: async (op: OutboxOp) => {
      calls.push(op.kind);
      if (!online) throw { name: 'TypeError', message: 'fetch failed' };
      if (op.kind === 'record_set' && closed) throw { code: 'P0001', message: 'SESSION_CLOSED', details: 'La sesión ya terminó.' };
      const id = `${op.kind}:${'id' in op.input ? op.input.id : ''}`;
      if (!rows.has(id)) rows.set(id, op);
      return rows.get(id);
    },
  };
};

describe('outbox offline', () => {
  it('guarda la hora del cliente al encolar', async () => {
    const box = new Outbox(createMemoryOutboxStorage(), async () => {}, () => new Date('2026-10-27T10:00:00Z'));
    const e = await box.enqueue(set(1));
    expect(e.op.kind === 'record_set' && e.op.input.clientTs).toBe('2026-10-27T10:00:00.000Z');
  });

  it('sin conexión no confirma nada y conserva el orden; al volver la red reenvía todo', async () => {
    const server = fakeServer();
    const box = new Outbox(createMemoryOutboxStorage(), server.execute);
    server.setOnline(false);
    await box.enqueue({ kind: 'start_session', input: { id: sid } });
    await box.enqueue(set(1));
    await box.enqueue(set(2));
    await box.enqueue({ kind: 'transition_session', input: { id: sid, action: 'complete' } });

    const offline = await box.flush();
    expect(offline).toMatchObject({ confirmed: 0, remaining: 4, stoppedBy: { code: 'NETWORK_ERROR' } });
    expect((await box.state()).pending.map((e) => e.op.kind)).toEqual([
      'start_session',
      'record_set',
      'record_set',
      'transition_session',
    ]);

    server.setOnline(true);
    const online = await box.flush();
    expect(online).toMatchObject({ confirmed: 4, failed: 0, remaining: 0 });
    expect(server.rows.size).toBe(4);
  });

  it('una operación ya aplicada en el servidor se puede reenviar sin duplicar (respuesta perdida)', async () => {
    const server = fakeServer();
    const storage = createMemoryOutboxStorage();
    const box = new Outbox(storage, server.execute);
    await box.enqueue(set(1));
    // El servidor aplicó la operación pero la respuesta no llegó: la entrada sigue pendiente
    await server.execute((await box.state()).pending[0]!.op);
    await box.flush();
    expect(server.rows.size).toBe(1);
    expect((await box.state()).pending).toHaveLength(0);
  });

  it('un error permanente pasa a «failed» y no bloquea el resto', async () => {
    const server = fakeServer();
    const box = new Outbox(createMemoryOutboxStorage(), server.execute);
    server.close();
    await box.enqueue(set(1));
    await box.enqueue({ kind: 'transition_session', input: { id: sid, action: 'complete' } });
    const r = await box.flush();
    expect(r).toMatchObject({ confirmed: 1, failed: 1, remaining: 0 });
    const st = await box.state();
    expect(st.failed[0]?.lastError?.code).toBe('SESSION_CLOSED');
    await box.dismissFailed(st.failed[0]!.opId);
    expect((await box.state()).failed).toHaveLength(0);
  });

  it('vaciados concurrentes comparten la misma ejecución', async () => {
    const server = fakeServer();
    const box = new Outbox(createMemoryOutboxStorage(), server.execute);
    await box.enqueue(set(1));
    const [a, b] = await Promise.all([box.flush(), box.flush()]);
    expect(a).toBe(b);
    expect(server.calls).toHaveLength(1);
  });

  it('persiste en un almacén clave/valor (localStorage / AsyncStorage)', async () => {
    const mem = new Map<string, string>();
    const kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const box1 = new Outbox(createKeyValueOutboxStorage(kv), async () => {
      throw { message: 'fetch failed' };
    });
    await box1.enqueue(set(1));
    await box1.flush();
    // «Reinicio» de la app: nueva instancia, mismo almacén
    const server = fakeServer();
    const box2 = new Outbox(createKeyValueOutboxStorage(kv), server.execute);
    expect((await box2.state()).pending[0]?.attempts).toBe(1);
    expect(await box2.flush()).toMatchObject({ confirmed: 1, remaining: 0 });
  });
});
