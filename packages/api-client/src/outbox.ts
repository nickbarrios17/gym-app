/**
 * Cola local (outbox) de operaciones de entrenamiento que se pueden registrar sin conexión (docs/sync.md).
 * - Solo admite las operaciones idempotentes de sesión/serie (todas llevan UUID del cliente).
 * - Una operación se elimina de la cola únicamente cuando el servidor la CONFIRMA.
 * - Orden FIFO. Un fallo transitorio (red, límite) detiene el vaciado para reintentar después.
 * - Un fallo permanente (p. ej. SESSION_CLOSED) mueve la operación a `failed` para mostrarla al usuario.
 */
import { VidaError, type DomainErrorShape, newId } from '@vida/domain';
import type { RecordSetInputT, StartSessionInputT, TransitionSessionInputT, UpdateSetPatchT } from '@vida/domain';
import { isRetryable, toVidaError } from './errors';

export type OutboxOp =
  | { kind: 'start_session'; input: StartSessionInputT }
  | { kind: 'add_session_exercise'; input: { id: string; sessionId: string; exerciseId: string; targetSets?: number } }
  | { kind: 'record_set'; input: RecordSetInputT }
  | { kind: 'update_set'; input: { id: string; patch: UpdateSetPatchT } }
  | { kind: 'delete_set'; input: { id: string } }
  | { kind: 'transition_session'; input: TransitionSessionInputT };

export interface OutboxEntry {
  opId: string;
  op: OutboxOp;
  enqueuedAt: string;
  attempts: number;
  lastError?: DomainErrorShape;
}

export interface OutboxState {
  pending: OutboxEntry[];
  failed: OutboxEntry[];
}

export interface OutboxStorage {
  load(): Promise<OutboxState>;
  save(state: OutboxState): Promise<void>;
}

export type OutboxExecutor = (op: OutboxOp) => Promise<unknown>;

export interface FlushResult {
  confirmed: number;
  failed: number;
  remaining: number;
  stoppedBy?: DomainErrorShape;
}

/** Fija la hora del cliente al encolar: el servidor la usa para timestamps de sesiones y series. */
const stampClientTs = (op: OutboxOp, now: string): OutboxOp => {
  switch (op.kind) {
    case 'start_session':
    case 'record_set':
    case 'transition_session':
      return { ...op, input: { ...op.input, clientTs: op.input.clientTs ?? now } } as OutboxOp;
    default:
      return op;
  }
};

export class Outbox {
  private flushing: Promise<FlushResult> | null = null;

  constructor(
    private readonly storage: OutboxStorage,
    private readonly execute: OutboxExecutor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async enqueue(op: OutboxOp): Promise<OutboxEntry> {
    const at = this.now().toISOString();
    const entry: OutboxEntry = { opId: newId(), op: stampClientTs(op, at), enqueuedAt: at, attempts: 0 };
    const state = await this.storage.load();
    state.pending.push(entry);
    await this.storage.save(state);
    return entry;
  }

  async state(): Promise<OutboxState> {
    return this.storage.load();
  }

  /** Vacía la cola en orden. Llamadas concurrentes comparten el mismo vaciado. */
  flush(): Promise<FlushResult> {
    this.flushing ??= this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  /** Descarta una operación fallida después de mostrarla al usuario. */
  async dismissFailed(opId: string): Promise<void> {
    const state = await this.storage.load();
    state.failed = state.failed.filter((e) => e.opId !== opId);
    await this.storage.save(state);
  }

  private async doFlush(): Promise<FlushResult> {
    const result: FlushResult = { confirmed: 0, failed: 0, remaining: 0 };
    const state = await this.storage.load();
    while (state.pending.length > 0) {
      const entry = state.pending[0]!;
      try {
        await this.execute(entry.op);
        state.pending.shift();
        result.confirmed++;
      } catch (raw) {
        const err: VidaError = toVidaError(raw);
        entry.attempts++;
        entry.lastError = err.toJSON();
        if (isRetryable(err)) {
          result.stoppedBy = err.toJSON();
          break;
        }
        state.pending.shift();
        state.failed.push(entry);
        result.failed++;
      }
      await this.storage.save(state);
    }
    await this.storage.save(state);
    result.remaining = state.pending.length;
    return result;
  }
}

const clone = (s: OutboxState): OutboxState => JSON.parse(JSON.stringify(s)) as OutboxState;

export const createMemoryOutboxStorage = (initial?: OutboxState): OutboxStorage => {
  let state: OutboxState = initial ? clone(initial) : { pending: [], failed: [] };
  return {
    load: async () => clone(state),
    save: async (s) => {
      state = clone(s);
    },
  };
};

/** Adaptador para localStorage (web) o AsyncStorage (Expo): cualquier almacén clave/valor de texto. */
export interface KeyValueStore {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

export const createKeyValueOutboxStorage = (kv: KeyValueStore, key = 'vida.outbox.v1'): OutboxStorage => ({
  load: async () => {
    try {
      const raw = await kv.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as Partial<OutboxState>) : {};
      return { pending: parsed.pending ?? [], failed: parsed.failed ?? [] };
    } catch {
      return { pending: [], failed: [] };
    }
  },
  save: async (s) => {
    await kv.setItem(key, JSON.stringify(s));
  },
});
