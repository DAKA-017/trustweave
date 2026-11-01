const ONE_MINUTE = 60_000;
const MAX_TRACKED_KEYS = 10_000;

function normalizeAddress(value) {
  const address = value.trim();
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function isInternalAddress(ip) {
  if (!ip) return true;
  const address = normalizeAddress(ip);
  if (address === '::1' || address === '127.0.0.1') return true;
  if (address.startsWith('10.') || address.startsWith('192.168.')) return true;
  const privateRange = /^172\.(1[6-9]|2\d|3[01])\./;
  return privateRange.test(address);
}

function firstPublicAddress(headerValue) {
  if (!headerValue) return null;
  for (const part of String(headerValue).split(',')) {
    const address = normalizeAddress(part);
    if (address && !isInternalAddress(address)) return address;
  }
  return null;
}

/**
 * Render hands the app a proxy address, so the socket peer says nothing about
 * the caller. Cloudflare sets CF-Connecting-IP and strips client-supplied copies
 * of it; X-Forwarded-For is only a fallback for non-proxied traffic.
 */
function clientKey(req) {
  const headers = req.headers ?? {};
  const fromCloudflare = firstPublicAddress(headers['cf-connecting-ip']);
  if (fromCloudflare) return fromCloudflare;
  const fromForwarded = firstPublicAddress(headers['x-forwarded-for']);
  if (fromForwarded) return fromForwarded;
  return isInternalAddress(req.ip) ? null : normalizeAddress(req.ip);
}

function pruneExpired(hits, now) {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}

/**
 * Fixed-window limiter for write endpoints. Writes rebuild or mutate the shared
 * in-memory world, so an unauthenticated caller could otherwise churn it freely.
 * Platform health checks and local tests arrive without a client address and
 * pass through untouched.
 */
export function rateLimit({ windowMs = ONE_MINUTE, max = 20 } = {}) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    const key = clientKey(req);
    if (!key) return next();

    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      if (hits.size >= MAX_TRACKED_KEYS) pruneExpired(hits, now);
      hits.set(key, { count: 1, resetAt: now + windowMs });
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
