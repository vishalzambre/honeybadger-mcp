const SECRET_KEY =
  /password|passwd|secret|token|authorization|api[_-]?key|access[_-]?key|csrf|authenticity|cookie|session[_-]?id|credit|ssn|private[_-]?key|bearer|client_secret|\botp\b|\bpin\b/i;

const MAX_DEPTH = 6;
const MAX_KEYS = 40;
const MAX_ITEMS = 30;
const MAX_STRING = 500;

/**
 * Copy a Honeybadger payload for display.
 * Secret-looking keys, cookies, and auth headers are replaced, and oversized
 * strings, arrays, and objects are truncated so a notice cannot flood the agent.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (typeof value === 'string') return truncate(value, MAX_STRING);
  if (typeof value !== 'object' || value === null) return value;

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ITEMS) items.push(`[${value.length - MAX_ITEMS} more items]`);
    return items;
  }

  const output: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS);
  for (const [key, entry] of entries) {
    output[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(entry, depth + 1);
  }
  const omitted = Object.keys(value as Record<string, unknown>).length - entries.length;
  if (omitted > 0) output._omitted_keys = omitted;
  return output;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… [${value.length - max} more chars]`;
}
