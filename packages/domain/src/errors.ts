/** Códigos de error de dominio compartidos por la base de datos (SQLSTATE P0001) y los clientes. */
export const DOMAIN_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'VERSION_CONFLICT',
  'ID_CONFLICT',
  'ACTIVE_SESSION_EXISTS',
  'SESSION_CLOSED',
  'INVALID_TRANSITION',
  'IMMUTABLE_FIELD',
  'OWNER_IMMUTABLE',
  'INVALID_TIME_ZONE',
  'CLIENT_TS_OUT_OF_RANGE',
  'EXERCISE_NOT_FOUND',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'UNKNOWN',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export interface DomainErrorShape {
  code: DomainErrorCode;
  message: string;
}

/** Error estandarizado { code, message }. El mensaje es seguro para mostrar: nunca incluye SQL ni secretos. */
export class VidaError extends Error implements DomainErrorShape {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'VidaError';
    this.code = code;
  }

  toJSON(): DomainErrorShape {
    return { code: this.code, message: this.message };
  }
}

export const isDomainErrorCode = (value: unknown): value is DomainErrorCode =>
  typeof value === 'string' && (DOMAIN_ERROR_CODES as readonly string[]).includes(value);

/** Mensajes por defecto en español cuando el servidor no aporta uno seguro. */
export const DEFAULT_ERROR_MESSAGES: Record<DomainErrorCode, string> = {
  NOT_AUTHENTICATED: 'Inicia sesión para continuar.',
  FORBIDDEN: 'No tienes permiso para hacer esto.',
  NOT_FOUND: 'No se encontró lo que buscas.',
  VALIDATION_FAILED: 'Revisa los datos e inténtalo de nuevo.',
  CONFLICT: 'Ya existe un registro con esos datos.',
  VERSION_CONFLICT: 'Esto cambió en otro dispositivo. Recarga y vuelve a intentarlo.',
  ID_CONFLICT: 'El identificador ya está en uso.',
  ACTIVE_SESSION_EXISTS: 'Ya tienes una sesión en curso.',
  SESSION_CLOSED: 'La sesión ya terminó.',
  INVALID_TRANSITION: 'Ese cambio de estado no está permitido.',
  IMMUTABLE_FIELD: 'Ese dato no se puede modificar.',
  OWNER_IMMUTABLE: 'No se puede cambiar el propietario de un registro.',
  INVALID_TIME_ZONE: 'La zona horaria no es válida.',
  CLIENT_TS_OUT_OF_RANGE: 'La hora del dispositivo no es válida.',
  EXERCISE_NOT_FOUND: 'El ejercicio no existe o no está disponible.',
  NETWORK_ERROR: 'Sin conexión. Lo intentaremos de nuevo.',
  RATE_LIMITED: 'Demasiados intentos. Espera un momento.',
  UNKNOWN: 'Algo salió mal. Inténtalo de nuevo.',
};
