const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const Centre = require('../models/Centre');
const Crop = require('../models/Crop');
const Notification = require('../models/Notification');
const TokenCounter = require('../models/TokenCounter');
const IdempotencyKey = require('../models/IdempotencyKey');
const { requireAuth, requireRole } = require('../middleware/auth');
const validateObjectId = require('../middleware/validateObjectId');
const { recordProcurementAndSettle } = require('../services/procurement');
const { transitionBooking } = require('../services/bookingTransitions');
const qr = require('../utils/qr');
const { audit } = require('../utils/audit');
const { todayISTDateString } = require('../utils/istDate');
const asyncHandler = require('../utils/asyncHandler');
const { emitScoped } = require('../utils/broadcast');

const router = express.Router();

// Targets the affected farmer + centre (+ admin/public, always) instead of
// every connected client — see utils/broadcast.js.
function broadcastChanged(req, booking) {
  const io = req.app.get('io');
  emitScoped(io, { farmerId: booking && booking.farmerId, centreId: booking && booking.centreId });
}

async function notify(userId, title, message, type) {
  await Notification.create({ userId, title, message, type: type || 'info' });
}

// Active queue statuses — a booking still "counts" against the
// one-active-booking-per-farmer+centre+crop rule while it's in one of these.
// Keep this in sync with the partialFilterExpression on the Booking model's
// unique index (models/Booking.js) — that index is the actual database-level
// guarantee; this array is used for the friendly pre-check and for release
// logic elsewhere in this file.
const ACTIVE_QUEUE_STATUSES = ['waiting', 'called', 'in-procurement'];

// An operator may only act on bookings at the one centre they're assigned
// to — without this check any operator could call, mark absent, or record
// a procurement for a booking at a completely different centre. Admins
// are not centre-scoped, so they can act on any booking.
function assertOperatorOwnsBooking(req, res, centre) {
  if (req.user.role === 'operator' && (!req.user.centreId || req.user.centreId.toString() !== centre.toString())) {
    res.status(403).json({ error: 'You can only manage bookings at your own assigned centre.' });
    return false;
  }
  return true;
}

function hashRequest(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function isDuplicateKeyError(err) {
  return err && (err.code === 11000 || (err.errorResponse && err.errorResponse.code === 11000));
}

// POST /api/bookings — farmer books a slot for a specific crop.
//
// Wrapped in a MongoDB session transaction (when the deployment supports
// one — see config/db.js) so validation, the duplicate-active-booking
// check, the seat claim, token allocation, and booking creation either all
// happen or none do. Two database-level unique indexes back this up so the
// guarantees hold even under real concurrency, not just "check then act":
//   - Booking { farmerId, centreId, cropId } partial-unique (active states)
//   - IdempotencyKey { farmerId, key } unique
// If either index rejects the write, we roll back and return 409 rather
// than a 500 — a duplicate-key error here is an expected concurrency
// outcome, not a bug.
router.post('/', requireAuth, requireRole('farmer'), asyncHandler(async (req, res) => {
  const { centreId, slotId, cropId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(centreId) || !mongoose.Types.ObjectId.isValid(slotId) || !mongoose.Types.ObjectId.isValid(cropId || '')) {
    return res.status(400).json({ error: 'Please complete all steps.' });
  }

  // Idempotency-Key support: a farmer's client generates one key per
  // booking *attempt* (see frontend script.js) and resends the same key on
  // retry (double-click, dropped response, mobile network retry). The key
  // is scoped to this farmer and hashed together with the exact booking
  // parameters, so reusing a key with different parameters is rejected
  // rather than silently returning the wrong booking.
  const idemKeyHeader = (req.headers['idempotency-key'] || '').toString().trim();
  const requestHash = hashRequest({ centreId, slotId, cropId });

  if (idemKeyHeader) {
    const existing = await IdempotencyKey.findOne({ farmerId: req.user._id, key: idemKeyHeader });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return res.status(409).json({ error: 'This request key was already used for a different booking.' });
      }
      if (existing.status === 'completed' && existing.bookingId) {
        return res.status(200).json({ bookingId: existing.bookingId.toString(), replay: true });
      }
      if (existing.status === 'pending') {
        return res.status(409).json({ error: 'That booking request is already being processed. Please wait.' });
      }
      // status === 'failed' (a previous attempt with this key genuinely
      // failed, e.g. slot filled up) — fall through and let this attempt
      // try again fresh below, reusing the same key document.
    }
  }

  const session = await mongoose.startSession();
  let resultBookingId = null;
  let clientError = null; // { status, message } for expected failures (400/409) surfaced after the transaction ends

  try {
    await session.withTransaction(async () => {
      const centre = await Centre.findById(centreId).session(session);
      const slot = await Slot.findById(slotId).session(session);
      if (!centre || !slot) {
        clientError = { status: 400, message: 'Please complete all steps.' };
        throw new Error('ABORT');
      }
      if (slot.centreId.toString() !== centre._id.toString()) {
        clientError = { status: 400, message: 'This slot does not belong to the selected centre.' };
        throw new Error('ABORT');
      }

      const crop = await Crop.findById(cropId).session(session);
      if (!crop) {
        clientError = { status: 400, message: 'Please select a valid crop.' };
        throw new Error('ABORT');
      }

      const centreCropIds = (centre.cropIds || []).map((id) => id.toString());
      if (!centreCropIds.includes(crop._id.toString())) {
        clientError = { status: 400, message: `${centre.name} does not procure ${crop.name}. Please choose a different crop or centre.` };
        throw new Error('ABORT');
      }

      // Booking cutoff: a slot's business date can never be earlier than
      // Asia/Kolkata's "today". Slot.date is stored as the same
      // Date.toDateString()-shaped text everywhere else in this app
      // (e.g. "Fri Aug 28 2026") — `new Date(str)` round-trips that back
      // into a real Date reliably, which is enough to compare calendar
      // days safely (no time-of-day component is stored, so there's no
      // partial-day ambiguity to worry about here).
      const slotDay = new Date(slot.date);
      const todayDay = new Date(todayISTDateString());
      if (Number.isNaN(slotDay.getTime())) {
        clientError = { status: 400, message: 'This slot has an invalid date.' };
        throw new Error('ABORT');
      }
      if (slotDay.getTime() < todayDay.getTime()) {
        clientError = { status: 409, message: 'This slot is for a past date and can no longer be booked. Please choose an upcoming date.' };
        throw new Error('ABORT');
      }

      // Friendly pre-check (the partial unique index on Booking is the real
      // guarantee — see models/Booking.js — but checking first lets us give
      // a specific, useful message instead of a generic conflict).
      const clash = await Booking.findOne({
        farmerId: req.user._id,
        centreId: centre._id,
        cropId: crop._id,
        queueStatus: { $in: ACTIVE_QUEUE_STATUSES },
      }).session(session);
      if (clash) {
        clientError = {
          status: 409,
          message: `You already have an active booking (token ${clash.tokenNumber}) for ${crop.name} at ${centre.name}. Complete or cancel it before booking again.`,
        };
        throw new Error('ABORT');
      }

      // Atomically claim one seat. findOneAndUpdate with the
      // `availableSlots > 0` condition baked into the query makes the
      // decrement atomic — only one of two simultaneous requests can win.
      const claimedSlot = await Slot.findOneAndUpdate(
        { _id: slot._id, availableSlots: { $gt: 0 } },
        { $inc: { availableSlots: -1 } },
        { new: true, session }
      );
      if (!claimedSlot) {
        clientError = { status: 409, message: 'Sorry, this slot just filled up. Pick another.' };
        throw new Error('ABORT');
      }

      // Atomic, per-centre-per-day token sequence — replaces
      // countDocuments()+offset, which is a check-then-act race under
      // concurrency (two requests can read the same count before either
      // inserts, producing duplicate tokens).
      const counter = await TokenCounter.findOneAndUpdate(
        { centreId: centre._id, date: slot.date },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true, session }
      );
      const tokenNumber = `${centre.tokenPrefix}-${counter.sequence}`;

      const bookingId = new mongoose.Types.ObjectId();
      const qrPayload = qr.sign(bookingId, tokenNumber);

      const [booking] = await Booking.create(
        [
          {
            _id: bookingId,
            farmerId: req.user._id,
            centreId: centre._id,
            slotId: slot._id,
            cropId: crop._id,
            bookingDate: slot.date,
            time: `${slot.start} - ${slot.end}`,
            tokenNumber,
            qrCode: JSON.stringify(qrPayload),
            qrGeneratedAt: new Date(),
            status: 'confirmed',
            queueStatus: 'waiting',
          },
        ],
        { session }
      );

      if (idemKeyHeader) {
        await IdempotencyKey.findOneAndUpdate(
          { farmerId: req.user._id, key: idemKeyHeader },
          { $setOnInsert: { requestHash }, $set: { status: 'completed', bookingId: booking._id } },
          { upsert: true, session }
        );
      }

      resultBookingId = booking._id.toString();
    });
  } catch (err) {
    if (clientError) {
      if (idemKeyHeader && clientError.status !== 409) {
        // record the failed attempt so a retry with the same key doesn't
        // get stuck behind a stale 'pending'/mismatch state
        await IdempotencyKey.findOneAndUpdate(
          { farmerId: req.user._id, key: idemKeyHeader },
          { $setOnInsert: { requestHash }, $set: { status: 'failed' } },
          { upsert: true }
        ).catch(() => {});
      }
      await session.endSession();
      return res.status(clientError.status).json({ error: clientError.message });
    }
    await session.endSession();
    if (isDuplicateKeyError(err)) {
      return res.status(409).json({ error: 'This booking could not be completed due to a conflicting request. Please try again.' });
    }
    console.error('[POST /api/bookings]', err);
    return res.status(500).json({ error: 'Something went wrong creating your booking. Please try again.' });
  }
  await session.endSession();

  const booking = await Booking.findById(resultBookingId);
  const crop = await Crop.findById(booking.cropId);
  const centre = await Centre.findById(booking.centreId);
  await notify(
    req.user._id,
    'Slot booked',
    `Your slot at ${centre.name} on ${new Date(booking.bookingDate).toDateString()} (${booking.time}) for ${crop.name} is confirmed. Token ${booking.tokenNumber}.`,
    'booking'
  );
  audit({ actorId: req.user._id, actorRole: 'farmer', action: 'booking.created', entityType: 'Booking', entityId: booking._id, centreId: booking.centreId });

  broadcastChanged(req, booking);
  res.status(201).json({ bookingId: resultBookingId });
}));

// POST /api/bookings/:id/cancel — farmer cancels their own booking.
// A single conditional update (the guard is baked into the query filter)
// makes this atomic: only the request that actually flips an eligible
// active booking to 'cancelled' proceeds to release the seat. Two
// simultaneous cancel requests can both reach this handler, but only one
// of them will match the filter and get a non-null result back.
router.post('/:id/cancel', requireAuth, requireRole('farmer'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const existing = await Booking.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found.' });
  if (existing.farmerId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'This is not your booking.' });
  }

  // transitionBooking() is the single atomic guard (Part 15) — only the
  // request that actually flips an eligible waiting/called booking to
  // 'cancelled' gets a non-null result back, so exactly one of two
  // simultaneous cancel requests proceeds to release a seat below.
  const booking = await transitionBooking(req.params.id, {
    fromStatuses: ['waiting', 'called'],
    toStatus: 'cancelled',
    extraSet: { status: 'cancelled' },
  });
  if (!booking) {
    return res.status(409).json({ error: 'This booking can no longer be cancelled.' });
  }

  // Only the request whose transitionBooking() call above actually matched
  // gets here, so exactly one seat is released per successful cancellation.
  await Slot.updateOne({ _id: booking.slotId }, { $inc: { availableSlots: 1 } });

  await notify(booking.farmerId, 'Slot cancelled', `Your booking for token ${booking.tokenNumber} has been cancelled.`, 'cancel');
  audit({ actorId: req.user._id, actorRole: 'farmer', action: 'booking.cancelled', entityType: 'Booking', entityId: booking._id, centreId: booking.centreId });

  broadcastChanged(req, booking);
  res.json({ ok: true });
}));

// POST /api/bookings/:id/call — operator calls this token to the counter
// (manual path — the operator picks the token from the live-queue table).
router.post('/:id/call', requireAuth, requireRole('operator', 'admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const existing = await Booking.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found.' });
  if (!assertOperatorOwnsBooking(req, res, existing.centreId)) return;

  // transitionBooking() (Part 15) replaces the old read-then-`.save()`
  // pattern, which had no atomic guard: two simultaneous "Call" requests
  // for the same token (e.g. two operator tabs) could both read
  // queueStatus 'waiting' before either write landed, and both would
  // "succeed". Only one findOneAndUpdate can match here.
  const booking = await transitionBooking(req.params.id, {
    fromStatuses: ['waiting'],
    toStatus: 'called',
    extraSet: { calledTime: new Date() },
  });
  if (!booking) {
    return res.status(409).json({ error: 'This token is not currently waiting.' });
  }

  await notify(
    booking.farmerId,
    'Your token has been called',
    `Token ${booking.tokenNumber} — please proceed to the procurement counter now.`,
    'called'
  );
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'booking.called', entityType: 'Booking', entityId: booking._id, centreId: booking.centreId });

  broadcastChanged(req, booking);
  res.json({ ok: true });
}));

// POST /api/bookings/:id/scan — operator scans the farmer's QR code at the
// counter, AFTER already calling them (see POST .../call above). This is a
// verification step, not how the call happens: it confirms the person at
// the counter really is the holder of this exact token before any
// procurement/payment can proceed. It's idempotent for an already-called
// or in-procurement token (just confirms/reopens it), and will also accept
// a still-waiting token as a fallback (calling it on the spot) in case an
// operator scans before clicking Call.
//
// The client sends the FULL decoded QR payload (bookingId, token, exp,
// sig) in the body, not just the id from the URL — the server verifies the
// signature and expiry itself rather than trusting that a request for
// `/bookings/:id/scan` implies the id came from a real, unmodified QR
// code. See utils/qr.js.
router.post('/:id/scan', requireAuth, requireRole('operator', 'admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  let booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'No booking found for this QR code.' });
  if (!assertOperatorOwnsBooking(req, res, booking.centreId)) return;

  const payload = req.body && req.body.payload;
  const verification = qr.verify(payload, booking._id.toString(), booking.tokenNumber);
  if (!verification.ok) {
    audit({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: 'qr.scan.failed',
      entityType: 'Booking',
      entityId: booking._id,
      centreId: booking.centreId,
      meta: { reason: verification.reason },
    });
    const messages = {
      malformed: 'This QR code could not be read. Ask the farmer to show it again.',
      'booking-mismatch': "This QR code doesn't match the expected booking.",
      'token-mismatch': "This QR code doesn't match the expected token.",
      expired: 'This QR code has expired. Ask the farmer to open a fresh copy from their app.',
      'bad-signature': 'This QR code failed verification and cannot be accepted.',
    };
    return res.status(400).json({ error: messages[verification.reason] || 'This QR code could not be verified.' });
  }

  if (booking.status === 'cancelled') {
    return res.status(409).json({ error: 'This booking has been cancelled.' });
  }

  let justCalled = false;
  if (booking.queueStatus === 'waiting') {
    // Same atomic guard as the dedicated /call route (Part 15) — a scan
    // that arrives at the exact moment another request calls or cancels
    // this token can't silently overwrite that outcome.
    const called = await transitionBooking(booking._id, {
      fromStatuses: ['waiting'],
      toStatus: 'called',
      extraSet: { calledTime: new Date() },
    });
    if (!called) {
      const fresh = await Booking.findById(booking._id);
      return res.status(409).json({ error: `Token ${booking.tokenNumber} is already ${fresh ? fresh.queueStatus : 'unavailable'} and can't be scanned in again.` });
    }
    booking = called;
    justCalled = true;
    await notify(
      booking.farmerId,
      'Your token has been called',
      `Token ${booking.tokenNumber} — please proceed to the procurement counter now.`,
      'called'
    );
    broadcastChanged(req, booking);
  } else if (!['called', 'in-procurement'].includes(booking.queueStatus)) {
    return res.status(409).json({ error: `Token ${booking.tokenNumber} is already ${booking.queueStatus} and can't be scanned in again.` });
  }

  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'qr.scan.verified', entityType: 'Booking', entityId: booking._id, centreId: booking.centreId });
  res.json({ ok: true, bookingId: booking._id.toString(), queueStatus: booking.queueStatus, justCalled });
}));

// POST /api/bookings/:id/absent — operator marks a no-show
router.post('/:id/absent', requireAuth, requireRole('operator', 'admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const existing = await Booking.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found.' });
  if (!assertOperatorOwnsBooking(req, res, existing.centreId)) return;

  // Part 15 fix: this route previously set `queueStatus = 'absent'`
  // unconditionally, with no check on the booking's current status at all —
  // an operator could mark a completed, cancelled, or in-procurement
  // booking "absent" by hitting this endpoint directly (the frontend only
  // shows the button for waiting/called rows, but the backend must be the
  // authority, not the UI — see the file-level ABSOLUTE RULES). The
  // frontend only offers "Absent" for waiting/called tokens, so those are
  // the only two legal source statuses.
  const booking = await transitionBooking(req.params.id, {
    fromStatuses: ['waiting', 'called'],
    toStatus: 'absent',
  });
  if (!booking) {
    return res.status(409).json({ error: `This token is ${existing.queueStatus} and can no longer be marked absent.` });
  }

  await notify(
    booking.farmerId,
    'Marked absent',
    `You were marked absent for token ${booking.tokenNumber}. Please contact the centre to reschedule.`,
    'absent'
  );
  audit({ actorId: req.user._id, actorRole: req.user.role, action: 'booking.absent', entityType: 'Booking', entityId: booking._id, centreId: booking.centreId });

  broadcastChanged(req, booking);
  res.json({ ok: true });
}));

// POST /api/bookings/:id/procurement — operator records the procurement +
// kicks off payment. The actual crediting/settlement/failure logic lives in
// services/procurement.js, shared with the background simulation, so every
// booking that ever resolves — through a live operator or the simulated
// "other centres" — always ends up with a real Procurement + Payment record
// behind it (see that file's comment for why that matters).
router.post('/:id/procurement', requireAuth, requireRole('operator', 'admin'), validateObjectId('id'), asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (!assertOperatorOwnsBooking(req, res, booking.centreId)) return;

  const { cropId, quantity, quality, deductionsPct } = req.body;
  if (!mongoose.Types.ObjectId.isValid(cropId || '')) {
    return res.status(400).json({ error: 'Please select a valid crop.' });
  }
  const qty = parseFloat(quantity);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 1e6) {
    return res.status(400).json({ error: 'Enter a valid quantity.' });
  }
  const ded = deductionsPct === undefined ? 0 : parseFloat(deductionsPct);
  if (!Number.isFinite(ded) || ded < 0 || ded > 100) {
    return res.status(400).json({ error: 'Enter a valid deduction percentage.' });
  }

  // Defense in depth: even though the farmer already chose a crop from the
  // centre's catalog at booking time, re-check here too — an operator could
  // in principle submit a different cropId in this step.
  const centre = await Centre.findById(booking.centreId);
  const centreCropIds = (centre.cropIds || []).map((id) => id.toString());
  if (!centreCropIds.includes(cropId.toString())) {
    return res.status(400).json({ error: `${centre.name} does not procure this crop.` });
  }

  try {
    const proc = await recordProcurementAndSettle(req.app.get('io'), booking, { cropId, quantity: qty, quality, deductionsPct: ded }, { actorId: req.user._id, actorRole: req.user.role });
    res.status(201).json({ procurementId: proc._id.toString() });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Could not record this procurement.' });
  }
}));

module.exports = router;
