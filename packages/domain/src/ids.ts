/**
 * IDs UUID v4 generados por el cliente (ADR 0002): permiten reintentar sin duplicar y trabajar sin conexión.
 * Requiere crypto.randomUUID (Node ≥ 19, navegadores modernos; en React Native usar un polyfill de crypto).
 */
export const newId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!c?.randomUUID) throw new Error('crypto.randomUUID no está disponible en este entorno');
  return c.randomUUID();
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuidV4 = (value: string): boolean => UUID_V4.test(value);
