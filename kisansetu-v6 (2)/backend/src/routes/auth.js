const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Counter = require('../models/Counter');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

function cleanMobile(m) {
  return (m || '').toString().trim();
}

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

// Email is optional everywhere it's collected, but if someone does type
// one in it should at least look like an email address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(res, email) {
  const val = (email || '').toString().trim();
  if (!val) return { ok: true, value: '' };
  if (!EMAIL_RE.test(val)) {
    badRequest(res, 'Enter a valid email address.');
    return { ok: false };
  }
  return { ok: true, value: val };
}

// GET /api/auth/setup-status — tells the frontend whether the one-time
// "Set up Super Admin" screen should be shown. It only ever returns
// needed:true when zero super-admin accounts exist in the whole system.
router.get('/setup-status', asyncHandler(async (_req, res) => {
  const count = await User.countDocuments({ role: 'super-admin' });
  res.json({ setupNeeded: count === 0 });
}));

// POST /api/auth/setup-super-admin — one-time screen. The countDocuments()
// check below is only a fast, friendly early-exit for the common case; the
// actual guarantee against two concurrent requests both succeeding is the
// partial unique index on User { role: 'super-admin' } (see models/User.js).
// If two requests race past the check together, the database rejects the
// second insert and we translate that into the same 409 the check gives.
router.post('/setup-super-admin', asyncHandler(async (req, res) => {
  const existing = await User.countDocuments({ role: 'super-admin' });
  if (existing > 0) {
    return res.status(409).json({ error: 'A Super Admin account already exists. This setup screen is now closed.' });
  }

  const { name, mobile, password, email } = req.body;
  if (!name || !name.trim()) return badRequest(res, 'Enter a name.');
  const mob = cleanMobile(mobile);
  if (!/^\d{10}$/.test(mob)) return badRequest(res, 'Enter a valid 10-digit mobile number.');
  if (!password || password.length < 6) return badRequest(res, 'Password must be at least 6 characters.');
  const emailCheck = cleanEmail(res, email);
  if (!emailCheck.ok) return;

  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await User.create({ role: 'super-admin', name: name.trim(), mobile: mob, email: emailCheck.value, passwordHash, status: 'active' });
  } catch (err) {
    // E11000 on the mobile unique index means a mobile clash (normal 409);
    // E11000 on the role partial unique index means someone else's
    // setup request won the race a moment ago — same friendly message.
    if (err && err.code === 11000) {
      if (err.keyPattern && err.keyPattern.mobile) {
        return res.status(409).json({ error: 'An account with this mobile number already exists.' });
      }
      return res.status(409).json({ error: 'A Super Admin account already exists. This setup screen is now closed.' });
    }
    throw err;
  }

  const token = signToken(user);
  audit({ actorId: user._id, actorRole: 'super-admin', action: 'auth.setup_super_admin' });
  res.status(201).json({ token, user });
}));

// POST /api/auth/register/farmer — the only way a farmer account gets
// created; farmers cannot be created by anyone else.
router.post('/register/farmer', asyncHandler(async (req, res) => {
  const { name, mobile, password, email, village, district, state, mainCrop, landAcres } = req.body;
  if (!name || !name.trim()) return badRequest(res, 'Enter your name.');
  const mob = cleanMobile(mobile);
  if (!/^\d{10}$/.test(mob)) return badRequest(res, 'Enter a valid 10-digit mobile number.');
  if (!password || password.length < 6) return badRequest(res, 'Password must be at least 6 characters.');
  const emailCheck = cleanEmail(res, email);
  if (!emailCheck.ok) return;

  const clash = await User.findOne({ mobile: mob });
  if (clash) return res.status(409).json({ error: 'An account with this mobile number already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  // Atomic counter, not countDocuments()+format — two concurrent
  // registrations can never be handed the same farmerId.
  const counter = await Counter.findOneAndUpdate(
    { name: 'farmerId' },
    { $inc: { sequence: 1 } },
    { upsert: true, new: true }
  );
  const farmerId = 'WB-FARM-' + (10000 + counter.sequence);

  const user = await User.create({
    role: 'farmer',
    name: name.trim(),
    mobile: mob,
    email: emailCheck.value,
    passwordHash,
    farmerId,
    village: village || '',
    district: district || '',
    state: state || '',
    mainCrop: mainCrop || '',
    landAcres: landAcres || '',
    status: 'active',
  });

  const token = signToken(user);
  res.status(201).json({ token, user });
}));

// POST /api/auth/login  { role: 'farmer' | 'operator' | 'admin', mobile, password }
// Each portal's login form passes its own `role` so a farmer's mobile number
// can never be used to sign into the operator/admin portals, and vice versa.
// The Administrator Portal ('admin') covers both tiers — a normal admin and
// the Super Admin — since there is only one administrator login screen; which
// tier a given account belongs to is decided by its own `role` in the DB.
router.post('/login', asyncHandler(async (req, res) => {
  const { role, mobile, password } = req.body;
  if (!['farmer', 'operator', 'admin'].includes(role)) {
    return badRequest(res, 'Unknown portal.');
  }
  const roleFilter = role === 'admin' ? { $in: ['admin', 'super-admin'] } : role;
  const mob = cleanMobile(mobile);
  const user = await User.findOne({ mobile: mob, role: roleFilter });
  if (!user) {
    audit({ actorRole: 'anonymous', action: 'auth.login.failed', meta: { role, mobile: mob } });
    return res.status(401).json({ error: 'Incorrect mobile number or password.' });
  }
  if (user.status === 'suspended') return res.status(401).json({ error: 'This account has been suspended.' });

  const ok = await bcrypt.compare(password || '', user.passwordHash);
  if (!ok) {
    audit({ actorId: user._id, actorRole: user.role, action: 'auth.login.failed', meta: { role, mobile: mob } });
    return res.status(401).json({ error: 'Incorrect mobile number or password.' });
  }

  const token = signToken(user);
  audit({ actorId: user._id, actorRole: user.role, action: 'auth.login.success' });
  res.json({ token, user });
}));

// GET /api/auth/me — used to restore a session after a page refresh.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/me — lets the signed-in user edit their own profile.
// Every role can update their name/email here; a farmer can also update
// their location and farming details. Mobile number, role, and centre
// assignment are intentionally not editable through this endpoint.
router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const { name, email } = req.body;
  if (name && name.trim()) user.name = name.trim();
  if (email !== undefined) {
    const emailCheck = cleanEmail(res, email);
    if (!emailCheck.ok) return;
    user.email = emailCheck.value;
  }
  if (user.role === 'farmer') {
    const { village, district, state, mainCrop, landAcres } = req.body;
    if (village !== undefined) user.village = village || '';
    if (district !== undefined) user.district = district || '';
    if (state !== undefined) user.state = state || '';
    if (mainCrop !== undefined) user.mainCrop = mainCrop || '';
    if (landAcres !== undefined) user.landAcres = landAcres || '';
  }
  await user.save();
  res.json({ user });
}));

module.exports = router;
