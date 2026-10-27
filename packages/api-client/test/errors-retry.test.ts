import { VidaError } from '@vida/domain';
import { describe, expect, it, vi } from 'vitest';
import { isRetryable, toVidaError } from '../src/errors';
import { backoffDelay, withRetry } from '../src/retry';

describe('toVidaError', () => {
  it('traduce errores de dominio de la base de datos', () => {
    const e = toVidaError({ code: 'P0001', message: 'ACTIVE_SESSION_EXISTS', details: 'Ya tienes una sesión en curso.' });
    expect(e.toJSON()).toEqual({ code: 'ACTIVE_SESSION_EXISTS', message: 'Ya tienes una sesión en curso.' });
  });

  it('no filtra texto SQL en violaciones de restricciones', () => {
    const e = toVidaError({
      code: '23514',
      message: 'new row for relation "workout_sets" violates check constraint "workout_sets_rpe_check"',
      details: 'Failing row contains (secret…)',
    });
    expect(e.code).toBe('VALIDATION_FAILED');
    expect(e.message).not.toMatch(/workout_sets|constraint|secret/);
  });

  it('un P0001 con código desconocido no se propaga tal cual', () => {
    expect(toVidaError({ code: 'P0001', message: 'relation "x" does not exist' }).code).toBe('UNKNOWN');
  });

  it('RLS, no encontrado, auth y red', () => {
    expect(toVidaError({ code: '42501', message: 'permission denied for table profiles' }).code).toBe('FORBIDDEN');
    expect(toVidaError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }).code).toBe('NOT_FOUND');
    expect(toVidaError({ code: 'invalid_credentials', status: 400, name: 'AuthApiError' }).message).toBe('Correo o contraseña incorrectos.');
    expect(toVidaError({ name: 'TypeError', message: 'fetch failed' }).code).toBe('NETWORK_ERROR');
    expect(toVidaError({ status: 503, message: 'upstream' }).code).toBe('NETWORK_ERROR');
    expect(toVidaError({ status: 429 }).code).toBe('RATE_LIMITED');
    expect(toVidaError('boom').code).toBe('UNKNOWN');
  });

  it('solo red y límite de peticiones son reintentables', () => {
    expect(isRetryable(new VidaError('NETWORK_ERROR', ''))).toBe(true);
    expect(isRetryable(new VidaError('RATE_LIMITED', ''))).toBe(true);
    expect(isRetryable(new VidaError('VERSION_CONFLICT', ''))).toBe(false);
    expect(isRetryable(new VidaError('SESSION_CLOSED', ''))).toBe(false);
  });
});

describe('withRetry', () => {
  const sleep = vi.fn(async (_ms: number) => {});

  it('reintenta fallos transitorios con backoff exponencial', async () => {
    sleep.mockClear();
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { name: 'TypeError', message: 'fetch failed' };
        return 'ok';
      },
      { sleep, random: () => 1, baseDelayMs: 100 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it('no reintenta errores de dominio', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw { code: 'P0001', message: 'SESSION_CLOSED', details: 'La sesión ya terminó.' };
      }, { sleep }),
    ).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
    expect(calls).toBe(1);
  });

  it('se rinde tras el número máximo de reintentos', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw { message: 'Failed to fetch' };
      }, { sleep, retries: 2 }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(calls).toBe(3);
  });

  it('el retardo está acotado y tiene jitter', () => {
    expect(backoffDelay(10, 300, 5000, () => 1)).toBe(5000);
    expect(backoffDelay(0, 300, 5000, () => 0)).toBe(150);
  });
});
