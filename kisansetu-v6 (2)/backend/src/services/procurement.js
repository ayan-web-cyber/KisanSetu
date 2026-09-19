const Crop = require('../models/Crop');
const Centre = require('../models/Centre');
const Booking = require('../models/Booking');
const Procurement = require('../models/Procurement');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const { audit } = require('../utils/audit');
const { emitScoped } = require('../utils/broadcast');
const { transitionBooking } = require('./bookingTransitions');

function fmtINR(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

async function notify(userId, title, message, type) {
  await Notification.create({ userId, title, message, type: type || 'info' });
}

function isDuplicateKeyError(err) {
  return err && (err.code === 11000 || (err.errorResponse && err.errorResponse.code === 11000));
}

// A settlement can genuinely fail (declined transfer, bad bank details,
// gateway timeout) same as it can in production.
const PAYMENT_FAILURE_RATE = 0.12;
const SETTLEMENT_DELAY_MS = 7000;

// The ONE place a booking is ever moved out of 'in-procurement'. Used both
// by a live operator submitting the procurement form (routes/bookings.js)
// and by the background queue simulation "completing" a called booking at
// a centre with no operator actively watching it (simulate.js). Routing
// both through here guarantees every booking that ever reaches a resolved
// state (completed or failed — there is no third option) always has a
// matching Procurement + Payment record behind it.
//
// Idempotency: the booking is only ever moved from 'called' -> 'in-procurement'
// through a single atomic conditional update. Two simultaneous callers for
// the same booking can both reach this function, but only one of them can
// win that update; the other gets a clean "already being processed" error
// rather than racing through to create a duplicate Procurement. The unique
// index on Procurement.bookingId (models/Procurement.js) is a second,
// database-level backstop against ever creating two.
async function recordProcurementAndSettle(io, booking, { cropId, quantity, quality, deductionsPct }, actor) {
  const crop = await Crop.findById(cropId);
  if (!crop) {
    const err = new Error('Invalid crop for procurement.');
    err.status = 400;
    throw err;
  }

  const qty = parseFloat(quantity) || 0;
  if (qty <= 0) {
    const err = new Error('Enter a valid quantity.');
    err.status = 400;
    throw err;
  }

  // Atomic guard: only a booking currently 'called' can move to
  // 'in-procurement'. A booking that is already 'in-procurement',
  // 'completed', 'failed', 'cancelled', or 'absent' cannot be re-entered —
  // this is what makes double-click / duplicate-tab / simultaneous-operator
  // submissions safe.
  const claimed = await transitionBooking(booking._id, {
    fromStatuses: ['called'],
    toStatus: 'in-procurement',
  });
  if (!claimed) {
    const fresh = await Booking.findById(booking._id);
    const err = new Error(
      fresh && fresh.queueStatus === 'in-procurement'
        ? 'This booking is already being processed by another request.'
        : `This booking is ${fresh ? fresh.queueStatus : 'no longer eligible'} and cannot be procured now.`
    );
    err.status = 409;
    throw err;
  }
  booking = claimed;

  const gross = qty * crop.rate;
  const deductions = Math.round((gross * (parseFloat(deductionsPct) || 0)) / 100);
  const net = gross - deductions;

  let proc;
  try {
    proc = await Procurement.create({
      bookingId: booking._id,
      farmerId: booking.farmerId,
      centreId: booking.centreId,
      cropId: crop._id,
      quantity: qty,
      unit: crop.unit,
      quality: quality || 'Grade A',
      rate: crop.rate,
      gross,
      deductions,
      net,
      status: 'completed',
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // Should be unreachable given the atomic guard above, but kept as a
      // hard database-level backstop rather than trusting application logic
      // alone.
      const dup = new Error('A procurement record already exists for this booking.');
      dup.status = 409;
      throw dup;
    }
    // Roll the booking status back so it isn't stuck in 'in-procurement'
    // with no procurement behind it. Deliberately NOT routed through
    // transitionBooking()/ALLOWED_TRANSITIONS — that table describes legal
    // forward business transitions, and 'in-procurement' -> 'called' isn't
    // one of them; this is error-recovery undoing a claim that never got a
    // real procurement behind it, not a state the app should ever reach
    // through normal flow.
    await Booking.updateOne({ _id: booking._id, queueStatus: 'in-procurement' }, { $set: { queueStatus: 'called' } });
    throw err;
  }

  const payment = await Payment.create({
    procurementId: proc._id,
    farmerId: booking.farmerId,
    amount: net,
    status: 'Processing',
  });

  await notify(
    booking.farmerId,
    'Procurement completed',
    `Your ${crop.name} procurement (${qty} ${crop.unit}) is complete. Payment of ${fmtINR(net)} is being processed.`,
    'procurement'
  );
  if (actor) {
    audit({ actorId: actor.actorId, actorRole: actor.actorRole, action: 'procurement.created', entityType: 'Procurement', entityId: proc._id, centreId: booking.centreId, meta: { bookingId: booking._id } });
  }

  if (io) emitScoped(io, { farmerId: booking.farmerId, centreId: booking.centreId });

  setTimeout(async () => {
    try {
      const succeeded = Math.random() >= PAYMENT_FAILURE_RATE;
      if (succeeded) {
        // Guard against this timer somehow firing twice for the same
        // payment (it can't under normal operation — one timer per
        // procurement — but this keeps the state transition itself
        // idempotent rather than relying on that assumption).
        const updated = await Payment.findOneAndUpdate(
          { _id: payment._id, status: 'Processing' },
          { $set: { status: 'Completed', transactionRef: 'TXN' + Math.floor(100000 + Math.random() * 900000), paymentDate: new Date() } },
          { new: true }
        );
        if (!updated) return;

        await transitionBooking(booking._id, {
          fromStatuses: ['in-procurement'],
          toStatus: 'completed',
          extraSet: { completedTime: new Date() },
        });

        await notify(
          booking.farmerId,
          'Payment completed',
          `Payment of ${fmtINR(net)} has been successfully processed to your linked bank account.`,
          'payment'
        );
        audit({ actorId: null, actorRole: 'system', action: 'payment.completed', entityType: 'Payment', entityId: payment._id, centreId: booking.centreId, meta: { bookingId: booking._id } });
      } else {
        const updated = await Payment.findOneAndUpdate(
          { _id: payment._id, status: 'Processing' },
          { $set: { status: 'Failed', paymentDate: new Date() } },
          { new: true }
        );
        if (!updated) return;

        await transitionBooking(booking._id, {
          fromStatuses: ['in-procurement'],
          toStatus: 'failed',
        });

        const centre = await Centre.findById(booking.centreId);
        await notify(
          booking.farmerId,
          'Payment failed',
          `We could not process your payment of ${fmtINR(net)}. Please contact ${centre ? centre.name : 'the centre'} to resolve this.`,
          'payment'
        );
        audit({ actorId: null, actorRole: 'system', action: 'payment.failed', entityType: 'Payment', entityId: payment._id, centreId: booking.centreId, meta: { bookingId: booking._id } });
      }
      if (io) emitScoped(io, { farmerId: booking.farmerId, centreId: booking.centreId });
    } catch (err) {
      console.error('[payment settlement]', err.message);
    }
  }, SETTLEMENT_DELAY_MS);

  return proc;
}

module.exports = { recordProcurementAndSettle, fmtINR, PAYMENT_FAILURE_RATE, SETTLEMENT_DELAY_MS };
