const SENSITIVE_KEY =
  /pass|secret|token|authorization|^auth$|signature|apikey|api_key|credential|cookie|email|phone|address|name$|body|content|description|title|message|^from$|^to$|^waid$|media|^ip$|ipaddress/i;

const SECRET_KEY =
  /pass|secret|token|authorization|signature|apikey|api_key|credential|cookie/i;

export const REDACTED = '[REDACTED]';

/**
 * Deep copy of `value` with secrets and personal data replaced, for operator views of
 * stored payloads. Identifiers, types and timestamps stay readable.
 */
export function redactSensitive(value: unknown): unknown {
  return redact(value, SENSITIVE_KEY, 0);
}

/** Deep copy of `value` with secret-like fields replaced; personal data stays. */
export function redactSecrets(value: unknown): unknown {
  return redact(value, SECRET_KEY, 0);
}

function redact(value: unknown, pattern: RegExp, depth: number): unknown {
  if (depth > 8) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redact(item, pattern, depth + 1));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        pattern.test(key) && item !== null && item !== undefined
          ? REDACTED
          : redact(item, pattern, depth + 1),
      ]),
    );
  }
  return value;
}
