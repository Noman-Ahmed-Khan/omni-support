import { randomUUID } from 'crypto';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createId(): string {
  return randomUUID();
}

export function isUuid(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

export function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}
