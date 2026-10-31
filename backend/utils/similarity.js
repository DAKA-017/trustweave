export function normalizeContent(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word shingles, used for near-duplicate submission detection. */
export function shingles(text, size = 4) {
  const words = normalizeContent(text).split(' ').filter(Boolean);
  if (words.length === 0) return new Set();
  if (words.length < size) return new Set([words.join(' ')]);
  const result = new Set();
  for (let i = 0; i <= words.length - size; i += 1) {
    result.add(words.slice(i, i + size).join(' '));
  }
  return result;
}

export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) {
    if (large.has(item)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}
