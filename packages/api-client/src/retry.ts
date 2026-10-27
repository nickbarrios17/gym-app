/**
 * Reintentos con backoff exponencial y jitter. Usar SOLO con operaciones idempotentes
 * (RPCs con UUID del cliente, lecturas). Nunca para signUp, signIn ni escrituras no idempotentes.
 */
import type { VidaError } from '@vida/domain';
import { isRetryable, toVidaError } from './errors';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Inyectable en pruebas. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const backoffDelay = (attempt: number, base: number, max: number, random: () => number): number =>
  Math.min(max, base * 2 ** attempt) * (0.5 + random() / 2);

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 300, maxDelayMs = 5000, sleep = defaultSleep, random = Math.random } = opts;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (raw) {
      const err: VidaError = toVidaError(raw);
      if (attempt >= retries || !isRetryable(err)) throw err;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs, random));
      attempt++;
    }
  }
}
