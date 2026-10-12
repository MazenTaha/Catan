/** Deep clone for plain, JSON-like data (objects, arrays, primitives). */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = deepClone(value[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in value) out[k] = deepClone((value as Record<string, unknown>)[k]);
  return out as T;
}
