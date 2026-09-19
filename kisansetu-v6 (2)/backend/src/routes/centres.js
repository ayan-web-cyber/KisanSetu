const express = require('express');
const Centre = require('../models/Centre');
const Crop = require('../models/Crop');
const Operator = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const validateObjectId = require('../middleware/validateObjectId');
const { audit } = require('../utils/audit');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

function broadcastChanged(req) {
  const io = req.app.get('io');
  // Intentionally global (not routed through utils/broadcast.js's scoped
  // helper): centre/crop records are shared reference data every screen
  // depends on (the farmer booking wizard's centre/crop pickers, every
  // dashboard's lookups), not something tied to one farmer or centre, so
  // every connected client — public, farmer, operator, admin — needs to
  // know when it changes.
  if (io) io.emit('state:changed');
}
function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

// Validates a `cropIds` array against the real Crop collection and returns
// only the ids that actually exist, deduplicated. Used by both create and
// update so a centre's crop-seed catalog can never reference a bogus id.
async function resolveCropIds(cropIds) {
  const requested = Array.isArray(cropIds) ? [...new Set(cropIds.filter(Boolean))] : [];
  if (!requested.length) return [];
  const found = await Crop.find({ _id: { $in: requested } }).select('_id').lean();
  return found.map((c) => c._id);
}

// POST /api/centres — Admin creates a new procurement centre (Center-SID)
router.post('/', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, village, district, state, capacityPerHour, openTime, closeTime, distance, tokenPrefix, cropIds } = req.body;
  if (!name || !village || !district || !state || !tokenPrefix) {
    return badRequest(res, 'Please fill in all required fields.');
  }
  const cap = parseInt(capacityPerHour, 10);
  if (!cap || cap <= 0) return badRequest(res, 'Enter a valid capacity per hour.');

  const resolvedCropIds = await resolveCropIds(cropIds);
  if (!resolvedCropIds.length) {
    return badRequest(res, "Select at least one crop this centre will procure.");
  }

  const centre = await Centre.create({
    name, village, district, state,
    capacityPerHour: cap,
    avgProcessMin: Math.max(1, Math.round(60 / cap)),
    openTime: openTime || '09:00',
    closeTime: closeTime || '17:00',
    distance: parseFloat(distance) || 0,
    tokenPrefix: tokenPrefix.toUpperCase().slice(0, 3),
    status: 'active',
    cropIds: resolvedCropIds,
  });

  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.centre.created', entityType: 'Centre', entityId: centre._id, centreId: centre._id });
  broadcastChanged(req);
  res.status(201).json({ centre });
}));

// PUT /api/centres/:id — Admin updates a centre
router.put('/:id', requireAuth, requireRole('admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const centre = await Centre.findById(req.params.id);
  if (!centre) return res.status(404).json({ error: 'Centre not found.' });

  const { name, village, district, state, capacityPerHour, openTime, closeTime, distance, tokenPrefix, status, cropIds } = req.body;
  if (name) centre.name = name;
  if (village) centre.village = village;
  if (district) centre.district = district;
  if (state) centre.state = state;
  if (capacityPerHour) {
    const cap = parseInt(capacityPerHour, 10);
    if (!cap || cap <= 0) return badRequest(res, 'Enter a valid capacity per hour.');
    centre.capacityPerHour = cap;
    centre.avgProcessMin = Math.max(1, Math.round(60 / cap));
  }
  if (openTime) centre.openTime = openTime;
  if (closeTime) centre.closeTime = closeTime;
  if (distance !== undefined) centre.distance = parseFloat(distance) || 0;
  if (tokenPrefix) centre.tokenPrefix = tokenPrefix.toUpperCase().slice(0, 3);
  if (status && ['active', 'inactive'].includes(status)) centre.status = status;
  if (cropIds !== undefined) {
    const resolvedCropIds = await resolveCropIds(cropIds);
    if (!resolvedCropIds.length) {
      return badRequest(res, "Select at least one crop this centre will procure.");
    }
    centre.cropIds = resolvedCropIds;
  }

  await centre.save();
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.centre.updated', entityType: 'Centre', entityId: centre._id, centreId: centre._id });
  broadcastChanged(req);
  res.json({ centre });
}));

// ---------------------------------------------------------------------
// Crop-seed catalog CRUD, scoped to one centre.
//
// An operator may create, read, update, and delete CROPS_SEED records
// (Crop documents) for the single centre they're assigned to — this is
// how an operator keeps their own centre's crop catalog current without
// needing an admin to do it for them via Manage Procurement Centres.
// Admins/super-admins may do the same for any centre.
// ---------------------------------------------------------------------

// Loads the centre from the :centreId param and checks the caller may
// manage its crop catalog: an operator only for their own assigned
// centre, an admin/super-admin for any centre.
async function loadCentreForCropAccess(req, res, next) {
  const centre = await Centre.findById(req.params.centreId);
  if (!centre) return res.status(404).json({ error: 'Centre not found.' });
  if (req.user.role === 'operator' && (!req.user.centreId || req.user.centreId.toString() !== centre._id.toString())) {
    return res.status(403).json({ error: 'You can only manage crops for your own assigned centre.' });
  }
  req.centre = centre;
  next();
}

// GET /api/centres/:centreId/crops — read this centre's crop-seed catalog
router.get(
  '/:centreId/crops',
  requireAuth,
  requireRole('operator', 'admin', 'super-admin'),
  validateObjectId('centreId'),
  loadCentreForCropAccess,
  asyncHandler(async (req, res) => {
    const crops = await Crop.find({ _id: { $in: req.centre.cropIds || [] } }).sort({ name: 1 });
    res.json({ crops });
  })
);

// POST /api/centres/:centreId/crops — create a crop and add it to this centre's catalog
router.post(
  '/:centreId/crops',
  requireAuth,
  requireRole('operator', 'admin', 'super-admin'),
  validateObjectId('centreId'),
  loadCentreForCropAccess,
  asyncHandler(async (req, res) => {
    const { name, unit, rate } = req.body;
    if (!name || !name.trim()) return badRequest(res, 'Enter a crop name.');
    if (!unit || !unit.trim()) return badRequest(res, 'Enter a unit (e.g. kg).');
    const r = parseFloat(rate);
    if (!r || r <= 0) return badRequest(res, 'Enter a valid rate.');

    const crop = await Crop.create({ name: name.trim(), unit: unit.trim(), rate: r, status: 'active' });
    req.centre.cropIds.push(crop._id);
    await req.centre.save();

    audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.crop.created', entityType: 'Crop', entityId: crop._id, centreId: req.centre._id });
    broadcastChanged(req);
    res.status(201).json({ crop });
  })
);

// PUT /api/centres/:centreId/crops/:cropId — update a crop in this centre's catalog
router.put(
  '/:centreId/crops/:cropId',
  requireAuth,
  requireRole('operator', 'admin', 'super-admin'),
  validateObjectId('centreId', 'cropId'),
  loadCentreForCropAccess,
  asyncHandler(async (req, res) => {
    const centreCropIds = (req.centre.cropIds || []).map((cid) => cid.toString());
    if (!centreCropIds.includes(req.params.cropId)) {
      return res.status(404).json({ error: "This crop is not in this centre's catalog." });
    }
    const crop = await Crop.findById(req.params.cropId);
    if (!crop) return res.status(404).json({ error: 'Crop not found.' });

    const { name, unit, rate, status } = req.body;
    if (name && name.trim()) crop.name = name.trim();
    if (unit && unit.trim()) crop.unit = unit.trim();
    if (rate !== undefined) {
      const r = parseFloat(rate);
      if (!r || r <= 0) return badRequest(res, 'Enter a valid rate.');
      crop.rate = r;
    }
    if (status && ['active', 'inactive'].includes(status)) crop.status = status;

    await crop.save();
    audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.crop.updated', entityType: 'Crop', entityId: crop._id, centreId: req.centre._id });
    broadcastChanged(req);
    res.json({ crop });
  })
);

// DELETE /api/centres/:centreId/crops/:cropId — remove a crop from this centre's catalog
// (unlinks it from this centre only; the Crop record itself is left alone
// in case another centre's catalog, or historical bookings/procurements,
// still reference it).
router.delete(
  '/:centreId/crops/:cropId',
  requireAuth,
  requireRole('operator', 'admin', 'super-admin'),
  validateObjectId('centreId', 'cropId'),
  loadCentreForCropAccess,
  asyncHandler(async (req, res) => {
    const centreCropIds = (req.centre.cropIds || []).map((cid) => cid.toString());
    if (!centreCropIds.includes(req.params.cropId)) {
      return res.status(404).json({ error: "This crop is not in this centre's catalog." });
    }
    if (centreCropIds.length <= 1) {
      return res.status(409).json({ error: 'A centre must procure at least one crop — add another before removing this one.' });
    }
    req.centre.cropIds = req.centre.cropIds.filter((cid) => cid.toString() !== req.params.cropId);
    await req.centre.save();
    audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.crop.removed', entityType: 'Crop', entityId: req.params.cropId, centreId: req.centre._id });
    broadcastChanged(req);
    res.json({ ok: true });
  })
);

// DELETE /api/centres/:id — Admin deletes a centre (blocked if operators still work there)
router.delete('/:id', requireAuth, requireRole('admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const stillStaffed = await Operator.countDocuments({ role: 'operator', centreId: req.params.id });
  if (stillStaffed > 0) {
    return res.status(409).json({ error: 'Reassign or delete this centre\'s operators before deleting it.' });
  }
  const centre = await Centre.findByIdAndDelete(req.params.id);
  if (!centre) return res.status(404).json({ error: 'Centre not found.' });
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'admin.centre.deleted', entityType: 'Centre', entityId: centre._id });
  broadcastChanged(req);
  res.json({ ok: true });
}));

module.exports = router;
