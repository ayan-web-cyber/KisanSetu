const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Centre = require('../models/Centre');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sanitizeUsers } = require('../utils/sanitizeUser');
const validateObjectId = require('../middleware/validateObjectId');
const { audit } = require('../utils/audit');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

function cleanMobile(m) {
  return (m || '').toString().trim();
}
function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}
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
// Escapes regex metacharacters so a search query can never be used to
// inject an arbitrary/expensive regex (ReDoS) or to widen the match beyond
// a literal substring search.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function searchFilter(role, q) {
  const filter = { role };
  const query = (q || '').toString().trim().slice(0, 100);
  if (query) {
    const safe = escapeRegex(query);
    filter.$or = [{ name: new RegExp(safe, 'i') }, { mobile: new RegExp(safe, 'i') }];
  }
  return filter;
}

/* ---------------- Normal Admins — managed only by a Super Admin ---------------- */

// GET /api/users/admins?q=
router.get('/admins', requireAuth, requireRole('super-admin'), asyncHandler(async (req, res) => {
  const list = await User.find(searchFilter('admin', req.query.q)).sort({ name: 1 }).lean();
  res.json({ admins: sanitizeUsers(list) });
}));

// POST /api/users/admins — Super Admin creates a normal admin
router.post('/admins', requireAuth, requireRole('super-admin'), asyncHandler(async (req, res) => {
  const { name, mobile, password } = req.body;
  if (!name || !name.trim()) return badRequest(res, 'Enter a name.');
  const mob = cleanMobile(mobile);
  if (!/^\d{10}$/.test(mob)) return badRequest(res, 'Enter a valid 10-digit mobile number.');
  if (!password || password.length < 6) return badRequest(res, 'Password must be at least 6 characters.');
  const emailCheck = cleanEmail(res, req.body.email);
  if (!emailCheck.ok) return;

  const clash = await User.findOne({ mobile: mob });
  if (clash) return res.status(409).json({ error: 'An account with this mobile number already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await User.create({
    role: 'admin', name: name.trim(), mobile: mob, email: emailCheck.value, passwordHash, status: 'active', createdBy: req.user._id,
  });
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.admin_account.created', entityType: 'User', entityId: admin._id });
  res.status(201).json({ admin });
}));

// PUT /api/users/admins/:id — Super Admin updates a normal admin
router.put('/admins/:id', requireAuth, requireRole('super-admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  const { name, mobile, password, status } = req.body;
  if (name && name.trim()) admin.name = name.trim();
  if (req.body.email !== undefined) {
    const emailCheck = cleanEmail(res, req.body.email);
    if (!emailCheck.ok) return;
    admin.email = emailCheck.value;
  }
  if (mobile) {
    const mob = cleanMobile(mobile);
    if (!/^\d{10}$/.test(mob)) return badRequest(res, 'Enter a valid 10-digit mobile number.');
    if (mob !== admin.mobile) {
      const clash = await User.findOne({ mobile: mob, _id: { $ne: admin._id } });
      if (clash) return res.status(409).json({ error: 'An account with this mobile number already exists.' });
    }
    admin.mobile = mob;
  }
  if (password) {
    if (password.length < 6) return badRequest(res, 'Password must be at least 6 characters.');
    admin.passwordHash = await bcrypt.hash(password, 10);
  }
  if (status && ['active', 'suspended'].includes(status)) admin.status = status;

  await admin.save();
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.admin_account.updated', entityType: 'User', entityId: admin._id });
  res.json({ admin });
}));

// DELETE /api/users/admins/:id — Super Admin deletes a normal admin
router.delete('/admins/:id', requireAuth, requireRole('super-admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const admin = await User.findOneAndDelete({ _id: req.params.id, role: 'admin' });
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.admin_account.deleted', entityType: 'User', entityId: admin._id });
  res.json({ ok: true });
}));

/* ---------------- Operators — managed only by a normal Admin ---------------- */

// GET /api/users/operators?q=  — an admin monitors all operators; a super-admin may also view
router.get('/operators', requireAuth, requireRole('admin', 'super-admin'), asyncHandler(async (req, res) => {
  const list = await User.find(searchFilter('operator', req.query.q)).sort({ name: 1 }).lean();
  res.json({ operators: sanitizeUsers(list) });
}));

// POST /api/users/operators — Admin creates an operator, assigned to one centre
router.post('/operators', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, mobile, password, centreId } = req.body;
  if (!name || !name.trim()) return badRequest(res, 'Enter a name.');
  const mob = cleanMobile(mobile);
  if (!/^\d{10}$/.test(mob)) return badRequest(res, 'Enter a valid 10-digit mobile number.');
  if (!password || password.length < 6) return badRequest(res, 'Password must be at least 6 characters.');
  const emailCheck = cleanEmail(res, req.body.email);
  if (!emailCheck.ok) return;
  const centre = centreId ? await Centre.findById(centreId) : null;
  if (!centre) return badRequest(res, 'Select the centre this operator will work at.');

  const clash = await User.findOne({ mobile: mob });
  if (clash) return res.status(409).json({ error: 'An account with this mobile number already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const operator = await User.create({
    role: 'operator', name: name.trim(), mobile: mob, email: emailCheck.value, passwordHash, centreId: centre._id,
    status: 'active', createdBy: req.user._id,
  });
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.operator.created', entityType: 'User', entityId: operator._id, centreId: operator.centreId });
  res.status(201).json({ operator });
}));

// PUT /api/users/operators/:id — Admin updates an operator
router.put('/operators/:id', requireAuth, requireRole('admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const operator = await User.findOne({ _id: req.params.id, role: 'operator' });
  if (!operator) return res.status(404).json({ error: 'Operator not found.' });

  const { name, mobile, password, centreId, status } = req.body;
  if (name && name.trim()) operator.name = name.trim();
  if (req.body.email !== undefined) {
    const emailCheck = cleanEmail(res, req.body.email);
    if (!emailCheck.ok) return;
    operator.email = emailCheck.value;
  }
  if (mobile) {
    const mob = cleanMobile(mobile);
    if (!/^\d{10}$/.test(mob)) return badRequest(res, 'Enter a valid 10-digit mobile number.');
    if (mob !== operator.mobile) {
      const clash = await User.findOne({ mobile: mob, _id: { $ne: operator._id } });
      if (clash) return res.status(409).json({ error: 'An account with this mobile number already exists.' });
    }
    operator.mobile = mob;
  }
  if (centreId) {
    const centre = await Centre.findById(centreId);
    if (!centre) return badRequest(res, 'Select a valid centre.');
    operator.centreId = centre._id;
  }
  if (password) {
    if (password.length < 6) return badRequest(res, 'Password must be at least 6 characters.');
    operator.passwordHash = await bcrypt.hash(password, 10);
  }
  if (status && ['active', 'suspended'].includes(status)) operator.status = status;

  await operator.save();
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.operator.updated', entityType: 'User', entityId: operator._id, centreId: operator.centreId });
  res.json({ operator });
}));

// DELETE /api/users/operators/:id — Admin deletes an operator
router.delete('/operators/:id', requireAuth, requireRole('admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const operator = await User.findOneAndDelete({ _id: req.params.id, role: 'operator' });
  if (!operator) return res.status(404).json({ error: 'Operator not found.' });
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.operator.deleted', entityType: 'User', entityId: operator._id });
  res.json({ ok: true });
}));

module.exports = router;
