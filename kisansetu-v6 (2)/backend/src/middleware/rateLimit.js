// Minimal in-memory fixed-window rate limiter. Deliberately dependency-free
// so it works without an `npm install`. Good enough for a single Node
// process; if this is ever run behind multiple instances/PM2 clusters,
// swap this for a shared store (e.g. Redis) so limits are enforced across
// processes instead of per-process.
function rateLimit({ windowMs = 60 * 1000, max = 20, keyFn } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Periodically drop expired entries so this map doesn't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = (keyFn ? keyFn(req) : req.ip) || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }
    next();
  };
}

module.exports = rateLimit;
