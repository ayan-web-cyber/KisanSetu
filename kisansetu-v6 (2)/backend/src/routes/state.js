const express = require('express');
const buildState = require('../utils/buildState');
const { optionalAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET /api/state — the full data bundle the frontend renders from.
// Intentionally reachable without login (the public TV queue-display screen
// is reachable straight from the landing page, before anyone logs in), but
// the CONTENT returned is scoped by buildState() to whoever is actually
// asking — see that file. An anonymous caller gets a minimal, PII-free
// projection; a farmer gets only their own records; an operator gets only
// their assigned centre's records; an admin gets everything. Write actions
// (booking, calling, procurement, etc.) still require proper
// authentication and role checks — see routes/bookings.js.
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const caller = req.user
    ? { role: req.user.role, userId: req.user._id.toString(), centreId: req.user.centreId ? req.user.centreId.toString() : null }
    : { role: null, userId: null, centreId: null };
  const db = await buildState(caller);
  res.json(db);
}));

module.exports = router;
