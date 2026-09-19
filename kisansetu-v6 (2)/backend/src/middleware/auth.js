const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User no longer exists.' });
    if (user.status === 'suspended') return res.status(401).json({ error: 'This account has been suspended.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

// Restricts a route to one or more roles, e.g. requireRole('operator', 'admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

// Like requireAuth, but never rejects the request — it just populates
// req.user when a valid session is present and leaves it undefined
// otherwise (anonymous/public caller). Used by GET /api/state, which is
// intentionally reachable without login (the public TV queue display) but
// must return a role-appropriate, PII-scoped slice of data rather than
// everything — see utils/buildState.js.
async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.userId);
    if (user && user.status !== 'suspended') req.user = user;
  } catch (err) {
    // invalid/expired token on an optional-auth route — treat as anonymous
    // rather than failing the request.
  }
  next();
}

module.exports = { requireAuth, requireRole, optionalAuth };
