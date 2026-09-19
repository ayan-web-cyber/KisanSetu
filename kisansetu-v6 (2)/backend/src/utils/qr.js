const crypto = require('crypto');

// QR tickets stay valid for the same "few days out" window slots are seeded
// for, plus a cushion — long enough to cover a farmer scanning it any time
// before/at their appointment, short enough that a leaked/old payload can't
// be replayed indefinitely.
const QR_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function getSecret() {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret) {
    // config/db.js already fails startup if this is missing, but guard
    // here too in case this module is ever imported before that check runs.
    throw new Error('QR_SIGNING_SECRET is not configured.');
  }
  return secret;
}

function sign(bookingId, token) {
  const exp = Date.now() + QR_TTL_MS;
  const payload = { v: 1, bookingId: bookingId.toString(), token, exp };
  const base = `${payload.v}.${payload.bookingId}.${payload.token}.${payload.exp}`;
  payload.sig = crypto.createHmac('sha256', getSecret()).update(base).digest('hex');
  return payload;
}

// Verifies a scanned payload against the booking it claims to belong to.
// Returns { ok: true } or { ok: false, reason }. Never trusts the payload's
// own bookingId/token beyond using them to look up what to compare against —
// callers must independently confirm payload.bookingId matches the booking
// they loaded from the DB before calling this.
function verify(payload, expectedBookingId, expectedToken) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'malformed' };
  const { v, bookingId, token, exp, sig } = payload;
  if (v !== 1 || !bookingId || !token || !exp || !sig) return { ok: false, reason: 'malformed' };
  if (bookingId !== expectedBookingId.toString()) return { ok: false, reason: 'booking-mismatch' };
  if (token !== expectedToken) return { ok: false, reason: 'token-mismatch' };
  if (Date.now() > Number(exp)) return { ok: false, reason: 'expired' };

  const base = `${v}.${bookingId}.${token}.${exp}`;
  const expectedSig = crypto.createHmac('sha256', getSecret()).update(base).digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'bad-signature' };
  }
  return { ok: true };
}

module.exports = { sign, verify };
