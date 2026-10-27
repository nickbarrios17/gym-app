/**
 * Máquina de estados de una sesión de entrenamiento. Refleja las reglas de la base de datos
 * (trigger workout_sessions_before_update y RPC transition_session):
 *   in_progress ⇄ paused → completed | abandoned (terminales, finales)
 * Repetir una transición ya aplicada es un no-op.
 */
import { VidaError } from './errors';

export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned';
export type SessionAction = 'pause' | 'resume' | 'complete' | 'abandon';

export const TERMINAL_STATUSES: readonly SessionStatus[] = ['completed', 'abandoned'];
export const isTerminal = (s: SessionStatus): boolean => TERMINAL_STATUSES.includes(s);
export const isActive = (s: SessionStatus): boolean => !isTerminal(s);

const TARGET: Record<SessionAction, SessionStatus> = {
  pause: 'paused',
  resume: 'in_progress',
  complete: 'completed',
  abandon: 'abandoned',
};

export interface TransitionResult {
  status: SessionStatus;
  noop: boolean;
}

/** Calcula el estado siguiente o lanza INVALID_TRANSITION. */
export const nextStatus = (current: SessionStatus, action: SessionAction): TransitionResult => {
  const target = TARGET[action];
  if (current === target) return { status: current, noop: true };
  if (isTerminal(current)) throw new VidaError('INVALID_TRANSITION', 'La sesión ya terminó.');
  if (action === 'pause' && current !== 'in_progress') throw new VidaError('INVALID_TRANSITION', 'Solo se puede pausar una sesión en curso.');
  if (action === 'resume' && current !== 'paused') throw new VidaError('INVALID_TRANSITION', 'Solo se puede reanudar una sesión pausada.');
  return { status: target, noop: false };
};

export const canTransition = (current: SessionStatus, action: SessionAction): boolean => {
  try {
    nextStatus(current, action);
    return true;
  } catch {
    return false;
  }
};

export interface SessionClock {
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  paused_seconds: number;
}

const ms = (iso: string) => new Date(iso).getTime();

/** Aplica una transición a los timestamps (para UI optimista y la cola offline). Igual que el servidor. */
export const applyTransition = (s: SessionClock, action: SessionAction, at: Date): SessionClock => {
  const { status, noop } = nextStatus(s.status, action);
  if (noop) return s;
  const ts = new Date(Math.max(at.getTime(), ms(s.started_at), s.paused_at ? ms(s.paused_at) : 0));
  const pausedNow = s.status === 'paused' && s.paused_at ? Math.floor((ts.getTime() - ms(s.paused_at)) / 1000) : 0;
  switch (action) {
    case 'pause':
      return { ...s, status, paused_at: ts.toISOString() };
    case 'resume':
      return { ...s, status, paused_at: null, paused_seconds: s.paused_seconds + pausedNow };
    default:
      return { ...s, status, ended_at: ts.toISOString(), paused_at: null, paused_seconds: s.paused_seconds + pausedNow };
  }
};

/** Duración neta de pausas, en segundos (igual que la vista session_summaries). */
export const netDurationSeconds = (s: SessionClock, now: Date = new Date()): number => {
  const end = s.ended_at ? ms(s.ended_at) : now.getTime();
  const currentPause = s.paused_at ? (now.getTime() - ms(s.paused_at)) / 1000 : 0;
  return Math.max(0, Math.floor((end - ms(s.started_at)) / 1000 - s.paused_seconds - currentPause));
};
