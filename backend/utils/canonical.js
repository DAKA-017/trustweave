/**
 * Deterministic canonical JSON: object keys are sorted recursively so the same
 * semantic record always produces the same bytes for signing and hashing.
 */
export function canonicalize(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}}`;
}

/** Remove the signature field before signing the record payload. */
export function recordPayload(record) {
  const { signature, ...rest } = record;
  void signature;
  return rest;
}
