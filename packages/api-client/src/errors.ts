/**
 * Traduce errores de PostgREST, Supabase Auth, Edge Functions y de red a { code, message } seguros.
 * Nunca se propaga el texto de PostgreSQL (puede contener nombres de tablas, restricciones o datos).
 */
import { DEFAULT_ERROR_MESSAGES, VidaError, isDomainErrorCode, type DomainErrorCode } from '@vida/domain';

interface PostgrestLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  name?: string;
}

const SQLSTATE_MAP: Record<string, DomainErrorCode> = {
  '23505': 'CONFLICT',
  '23503': 'VALIDATION_FAILED',
  '23514': 'VALIDATION_FAILED',
  '23502': 'VALIDATION_FAILED',
  '22P02': 'VALIDATION_FAILED',
  '22003': 'VALIDATION_FAILED',
  '22007': 'VALIDATION_FAILED',
  '22008': 'VALIDATION_FAILED',
  '22023': 'VALIDATION_FAILED',
  '42501': 'FORBIDDEN',
  '40001': 'CONFLICT',
  '40P01': 'CONFLICT',
  PGRST116: 'NOT_FOUND',
  PGRST301: 'NOT_AUTHENTICATED',
  PGRST302: 'NOT_AUTHENTICATED',
  PGRST303: 'NOT_AUTHENTICATED',
};

const AUTH_CODE_MAP: Record<string, [DomainErrorCode, string]> = {
  invalid_credentials: ['NOT_AUTHENTICATED', 'Correo o contraseña incorrectos.'],
  email_not_confirmed: ['NOT_AUTHENTICATED', 'Confirma tu correo para continuar.'],
  user_already_exists: ['CONFLICT', 'Ya existe una cuenta con ese correo.'],
  email_exists: ['CONFLICT', 'Ya existe una cuenta con ese correo.'],
  weak_password: ['VALIDATION_FAILED', 'La contraseña es demasiado débil.'],
  same_password: ['VALIDATION_FAILED', 'La nueva contraseña debe ser distinta.'],
  session_not_found: ['NOT_AUTHENTICATED', 'Tu sesión expiró. Vuelve a iniciar sesión.'],
  over_request_rate_limit: ['RATE_LIMITED', DEFAULT_ERROR_MESSAGES.RATE_LIMITED],
  over_email_send_rate_limit: ['RATE_LIMITED', DEFAULT_ERROR_MESSAGES.RATE_LIMITED],
};

const looksLikeNetworkFailure = (e: PostgrestLike): boolean => {
  const m = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
  return (
    e.name === 'AuthRetryableFetchError' ||
    e.name === 'FunctionsFetchError' ||
    m.includes('failed to fetch') ||
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('econnrefused') ||
    m.includes('load failed')
  );
};

export const toVidaError = (error: unknown): VidaError => {
  if (error instanceof VidaError) return error;
  if (error == null || typeof error !== 'object') return new VidaError('UNKNOWN', DEFAULT_ERROR_MESSAGES.UNKNOWN);
  const e = error as PostgrestLike;

  // Errores de dominio levantados por la base de datos: message = CÓDIGO, details = texto seguro
  if (e.code === 'P0001' && isDomainErrorCode(e.message)) {
    return new VidaError(e.message, e.details || DEFAULT_ERROR_MESSAGES[e.message]);
  }
  if (e.code && e.code in AUTH_CODE_MAP) {
    const [code, message] = AUTH_CODE_MAP[e.code]!;
    return new VidaError(code, message);
  }
  if (e.code && e.code in SQLSTATE_MAP) {
    const code = SQLSTATE_MAP[e.code]!;
    return new VidaError(code, DEFAULT_ERROR_MESSAGES[code]);
  }
  if (e.status === 429) return new VidaError('RATE_LIMITED', DEFAULT_ERROR_MESSAGES.RATE_LIMITED);
  if (e.status === 401) return new VidaError('NOT_AUTHENTICATED', DEFAULT_ERROR_MESSAGES.NOT_AUTHENTICATED);
  if (e.status === 403) return new VidaError('FORBIDDEN', DEFAULT_ERROR_MESSAGES.FORBIDDEN);
  if (looksLikeNetworkFailure(e) || (e.status !== undefined && e.status >= 500)) {
    return new VidaError('NETWORK_ERROR', DEFAULT_ERROR_MESSAGES.NETWORK_ERROR);
  }
  return new VidaError('UNKNOWN', DEFAULT_ERROR_MESSAGES.UNKNOWN);
};

/** ¿Tiene sentido reintentar? Solo fallos transitorios: red, 5xx, límite de peticiones, conflictos de serialización. */
export const isRetryable = (e: VidaError): boolean => e.code === 'NETWORK_ERROR' || e.code === 'RATE_LIMITED';
