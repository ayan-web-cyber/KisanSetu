const Centre = require('../models/Centre');
const Crop = require('../models/Crop');
const User = require('../models/User');
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const Procurement = require('../models/Procurement');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const DailyStat = require('../models/DailyStat');
const { todayISTDateString } = require('./istDate');

// Assembles the same shape the original client-side `seedDB()` produced —
// { centres, crops, farmers, slots, bookings, queue, procurements, payments,
//   notifications, history14 } — except every record now comes straight out
// of MongoDB, AND the contents are scoped to who's asking (see `caller`
// below). This keeps the existing frontend render functions working
// (they all still just read from a single `state.db` object) while making
// sure GET /api/state — which is intentionally reachable without login,
// for the public TV queue display — never leaks private data to an
// anonymous caller, and an authenticated caller never receives more than
// their role needs.
//
// caller: { role: 'farmer'|'operator'|'admin'|'super-admin'|null, userId, centreId }
// role is null for an anonymous/public request.
async function buildState(caller) {
  caller = caller || { role: null, userId: null, centreId: null };
  const isPublic = !caller.role;
  const isFarmer = caller.role === 'farmer';
  const isOperator = caller.role === 'operator';
  const isAdmin = caller.role === 'admin' || caller.role === 'super-admin';

  const [centresRaw, crops, slots, bookingsRaw] = await Promise.all([
    Centre.find().sort({ distance: 1 }).lean(),
    Crop.find().lean(),
    Slot.find().lean(),
    Booking.find().sort({ createdAt: 1 }).lean(),
  ]);

  const toId = (v) => (v ? v.toString() : v);
  const stamp = (doc) => {
    const out = { ...doc, id: toId(doc._id) };
    delete out._id;
    delete out.__v;
    return out;
  };

  const centresOut = centresRaw.map((c) => ({ ...stamp(c), cropIds: (c.cropIds || []).map(toId) }));
  const cropsOut = crops.map(stamp);

  let bookingsOut = bookingsRaw.map((b) => ({
    ...stamp(b),
    farmerId: toId(b.farmerId),
    centreId: toId(b.centreId),
    slotId: toId(b.slotId),
    cropId: toId(b.cropId),
  }));

  // Scope bookings by caller before anything else derives from them —
  // farmers only ever see their own bookings (full detail, including their
  // own QR payload); operators only see bookings at their assigned centre;
  // admins see everything; the public/TV view gets a minimal, PII-free
  // projection (no farmerId, no cropId, no QR payload — just enough to
  // render a live token board).
  let farmersOut = [];
  let slotsOut = [];
  let procurementsOut = [];
  let paymentsOut = [];
  let notificationsOut = [];
  let history14Out = [];

  if (isPublic) {
    bookingsOut = bookingsOut.map((b) => ({
      id: b.id,
      centreId: b.centreId,
      bookingDate: b.bookingDate,
      tokenNumber: b.tokenNumber,
      queueStatus: b.queueStatus,
    }));
    // no farmers, no slots, no procurements, no payments, no notifications,
    // no chart history for an anonymous caller.
  } else {
    if (isFarmer) {
      bookingsOut = bookingsOut.filter((b) => b.farmerId === caller.userId);
    } else if (isOperator && caller.centreId) {
      bookingsOut = bookingsOut.filter((b) => b.centreId === caller.centreId);
    } // admin: unfiltered

    const visibleBookingIds = new Set(bookingsOut.map((b) => b.id));

    const [procurements, payments, farmers] = await Promise.all([
      Procurement.find().lean(),
      Payment.find().lean(),
      isAdmin || isOperator ? User.find({ role: 'farmer' }).lean() : User.findById(caller.userId).lean(),
    ]);

    procurementsOut = procurements
      .map((p) => ({ ...stamp(p), bookingId: toId(p.bookingId), farmerId: toId(p.farmerId), centreId: toId(p.centreId), cropId: toId(p.cropId) }))
      .filter((p) => (isAdmin ? true : visibleBookingIds.has(p.bookingId)));

    const visibleProcurementIds = new Set(procurementsOut.map((p) => p.id));
    paymentsOut = payments
      .map((p) => ({ ...stamp(p), farmerId: toId(p.farmerId), procurementId: toId(p.procurementId) }))
      .filter((p) => (isAdmin ? true : visibleProcurementIds.has(p.procurementId)));

    if (isFarmer) {
      farmersOut = farmers ? [{ ...stamp(farmers) }] : [];
      delete (farmersOut[0] || {}).passwordHash;
    } else {
      // operator/admin — needed for Manage Farmers / Bookings / Payments
      // tables, which look farmers up by id. passwordHash is stripped.
      farmersOut = (farmers || []).map((f) => {
        const out = stamp(f);
        delete out.passwordHash;
        return out;
      });
    }

    slotsOut = slots.map((s) => ({ ...stamp(s), centreId: toId(s.centreId) }));

    notificationsOut = await Notification.find({ userId: caller.userId }).sort({ createdAt: -1 }).lean();
    notificationsOut = notificationsOut.map((n) => ({ ...stamp(n), userId: toId(n.userId) }));

    if (isOperator || isAdmin) {
      const history14 = await DailyStat.find().sort({ date: 1 }).lean();
      history14Out = history14.map(stamp);
    }
  }

  // Derive per-centre live queue info (this replaces the old mutable
  // `centre.queueOrder` / `centre.nowServingBookingId` fields). Built from
  // whatever slice of `bookingsOut` the caller is allowed to see, so this
  // never exposes queue membership for bookings the caller can't see.
  const queue = {};
  bookingsOut.forEach((b) => {
    queue[b.id] = {
      status: b.queueStatus,
      checkInTime: b.checkInTime,
      calledTime: b.calledTime,
      completedTime: b.completedTime,
    };
  });

  // The "live queue" — who's now serving, who's waiting — must only ever
  // reflect today's bookings, and (for operator/admin/public) is computed
  // across ALL of today's bookings at each centre regardless of the
  // caller's own filter above, so the TV board and operator queue table
  // show the true live queue rather than just "your own bookings".
  // Business "today" must be Asia/Kolkata's wall-clock date, not the host
  // process's local timezone (most hosting defaults to UTC, which would
  // show yesterday's — or tomorrow's — queue for part of every day).
  const todayStr = todayISTDateString();
  const queueSourceBookings = isPublic || isAdmin ? bookingsOut : bookingsRaw.map((b) => ({ id: toId(b._id), centreId: toId(b.centreId), bookingDate: b.bookingDate, queueStatus: b.queueStatus }));
  centresOut.forEach((centre) => {
    const centreBookings = queueSourceBookings.filter((b) => b.centreId === centre.id && b.bookingDate === todayStr);
    centre.queueOrder = centreBookings.map((b) => b.id);
    const called = centreBookings.find((b) => b.queueStatus === 'called');
    centre.nowServingBookingId = called ? called.id : null;
  });

  return {
    centres: centresOut,
    crops: cropsOut,
    farmers: farmersOut,
    slots: slotsOut,
    bookings: bookingsOut,
    queue,
    procurements: procurementsOut,
    payments: paymentsOut,
    notifications: notificationsOut,
    history14: history14Out,
  };
}

module.exports = buildState;
