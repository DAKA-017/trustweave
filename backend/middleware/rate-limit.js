const ONE_MINUTE = 60_000;
const MAX_TRACKED_KEYS = 10_000;

function isInternalAddress(ip) {
  if (!ip) return true;
  const address = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (address === '::1' || address === '127.0.0.1') return true;
  if (address.startsWith('10.') || address.startsWith('192.168.')) return true;
  const privateRange = /^172\.(1[6-9]|2\d|3[01])\./;
  return privateRange.test(address);
}

function pruneExpired(hits, now) {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}

/**
 * Fixed-window limiter for write endpoints. Writes rebuild or mutate the shared
 * in-memory world, so an unauthenticated caller could otherwise churn it freely.
 * Platform health checks and local tests arrive from private addresses and pass
 * through untouched.
 */
export function rateLimit({ windowMs = ONE_MINUTE, max = 20 } = {}) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    const ip = req.ip;
    if (isInternalAddress(ip)) return next();

    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      if (hits.size >= MAX_TRACKED_KEYS) pruneExpired(hits, now);
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count <= max) return next();

    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: `Too many write requests. Retry in ${retryAfter}s.`,
      },
    });
  };
}
