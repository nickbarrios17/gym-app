import { describe, expect, it } from 'vitest';
import { VidaError } from '../src/errors';
import { applyTransition, canTransition, netDurationSeconds, nextStatus, type SessionClock } from '../src/session-machine';

const start: SessionClock = {
  status: 'in_progress',
  started_at: '2026-10-26T10:00:00.000Z',
  ended_at: null,
  paused_at: null,
  paused_seconds: 0,
};
const at = (min: number) => new Date(Date.parse(start.started_at) + min * 60_000);

describe('máquina de estados', () => {
  it('transiciones válidas', () => {
    expect(nextStatus('in_progress', 'pause')).toEqual({ status: 'paused', noop: false });
    expect(nextStatus('paused', 'resume')).toEqual({ status: 'in_progress', noop: false });
    expect(nextStatus('paused', 'complete')).toEqual({ status: 'completed', noop: false });
    expect(nextStatus('in_progress', 'abandon')).toEqual({ status: 'abandoned', noop: false });
  });

  it('repetir la misma transición es un no-op', () => {
    expect(nextStatus('paused', 'pause').noop).toBe(true);
    expect(nextStatus('in_progress', 'resume').noop).toBe(true);
    expect(nextStatus('completed', 'complete').noop).toBe(true);
    expect(nextStatus('abandoned', 'abandon').noop).toBe(true);
  });

  it('los estados terminales son finales', () => {
    expect(() => nextStatus('completed', 'abandon')).toThrow(VidaError);
    expect(() => nextStatus('completed', 'resume')).toThrow(VidaError);
    expect(() => nextStatus('abandoned', 'complete')).toThrow(VidaError);
    try {
      nextStatus('completed', 'pause');
    } catch (e) {
      expect((e as VidaError).code).toBe('INVALID_TRANSITION');
    }
    expect(canTransition('abandoned', 'resume')).toBe(false);
  });
});

describe('reloj de la sesión', () => {
  it('acumula pausas y calcula la duración neta (igual que session_summaries)', () => {
    let s = applyTransition(start, 'pause', at(10));
    expect(s.paused_at).toBe(at(10).toISOString());
    s = applyTransition(s, 'pause', at(12)); // no-op
    expect(s.paused_at).toBe(at(10).toISOString());
    s = applyTransition(s, 'resume', at(20));
    expect(s.paused_seconds).toBe(600);
    s = applyTransition(s, 'complete', at(60));
    expect(s.status).toBe('completed');
    expect(netDurationSeconds(s)).toBe(3000);
  });

  it('completar desde pausa suma la pausa en curso', () => {
    const s = applyTransition(applyTransition(start, 'pause', at(50)), 'complete', at(60));
    expect(s.paused_seconds).toBe(600);
    expect(netDurationSeconds(s)).toBe(3000);
  });

  it('una hora anterior al inicio se ajusta al inicio', () => {
    const s = applyTransition(start, 'complete', at(-5));
    expect(s.ended_at).toBe(start.started_at);
  });

  it('una sesión pausada no suma tiempo mientras sigue pausada', () => {
    const s = applyTransition(start, 'pause', at(30));
    expect(netDurationSeconds(s, at(45))).toBe(1800);
  });
});
