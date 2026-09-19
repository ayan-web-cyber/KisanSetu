const Centre = require('./models/Centre');
const Booking = require('./models/Booking');
const Crop = require('./models/Crop');
const User = require('./models/User');
const { recordProcurementAndSettle } = require('./services/procurement');
const { transitionBooking } = require('./services/bookingTransitions');
const { todayISTDateString } = require('./utils/istDate');
const { emitScoped } = require('./utils/broadcast');

// Same idea as the original demo's client-side auto-advance engine, except
// it now runs once on the server and is broadcast to every connected
// browser/device via Socket.IO — so the "queue feels alive" even with zero
// users online, and every client sees the same live state.
//
// A booking only ever ends up in one of exactly two resolved states —
// completed or failed — and both always come with a real Procurement +
// Payment record behind them (that pairing IS the transaction history).
// This engine used to shortcut that by flipping a called booking straight
// to 'completed' by itself, which produced bookings with no procurement or
// payment ever recorded — blank rows on the Payments page. It now goes
// through the exact same recordProcurementAndSettle() pipeline a live
// operator's procurement form uses, with a plausible simulated quantity —
// so there is no path to a resolved booking that isn't backed by a record.
function startSimulation(io) {
  const intervalMs = parseInt(process.env.SIMULATION_INTERVAL_MS, 10) || 6000;

  setInterval(async () => {
    try {
      const centres = await Centre.find();
      // Centres with a real, active operator assigned are left for that
      // operator to call/verify/complete themselves — the simulation only
      // fast-forwards "other centres" nobody is actually staffing right
      // now, so it never races a human mid-scan or completes a token out
      // from under them.
      const staffedCentreIds = new Set(
        (await User.find({ role: 'operator', status: 'active', centreId: { $ne: null } }).distinct('centreId')).map((id) => id.toString())
      );

      let changed = false;
      // Which centres/farmers this tick actually touched, so the
      // end-of-tick broadcast can target just them (plus admin/public,
      // always) instead of every connected client — see utils/broadcast.js.
      const changedCentreIds = new Set();
      const changedFarmerIds = new Set();
      // Only today's bookings are actually "in the queue" right now — slots
      // are seeded several days out, so without this the engine would call
      // and complete tomorrow's (or later) bookings before their day even
      // arrives.
      // Asia/Kolkata's wall-clock date, not the host process's local
      // timezone — same reasoning as buildState.js.
      const todayStr = todayISTDateString();

      for (const centre of centres) {
        if (staffedCentreIds.has(centre._id.toString())) continue;
        if (Math.random() >= 0.35) continue;

        const called = await Booking.findOne({ centreId: centre._id, queueStatus: 'called', bookingDate: todayStr });
        const waiting = await Booking.find({ centreId: centre._id, queueStatus: 'waiting', bookingDate: todayStr }).sort({ createdAt: 1 });

        if (called && Math.random() < 0.5) {
          const crop = await Crop.findById(called.cropId);
          if (crop) {
            // A plausible stand-in for what a real operator would type into
            // the procurement form — the crop the farmer already said
            // they'd bring, a realistic quantity, and a mostly-decent grade.
            const quantity = Math.round(40 + Math.random() * 260);
            const quality = Math.random() < 0.7 ? 'Grade A' : Math.random() < 0.85 ? 'Grade B' : 'Grade C';
            const deductionsPct = Math.round(Math.random() * 4);
            try {
              await recordProcurementAndSettle(io, called, { cropId: crop._id, quantity, quality, deductionsPct });
              changed = true;
              changedCentreIds.add(centre._id.toString());
              changedFarmerIds.add(called.farmerId.toString());
            } catch (err) {
              console.error('[simulate] procurement failed:', err.message);
            }
          }
        } else if (waiting.length && !called && Math.random() < 0.6) {
          const next = waiting[0];
          // Part 15: same atomic transitionBooking() every other caller
          // uses, instead of a plain `.save()` with no guard — this is the
          // one path where an unstaffed centre could still, in principle,
          // get a real operator assigned mid-tick (or a farmer could
          // cancel) between the query above and the write below; a lost
          // race here is just skipped for this tick rather than silently
          // overwriting whatever the human/farmer action just did.
          const calledNow = await transitionBooking(next._id, {
            fromStatuses: ['waiting'],
            toStatus: 'called',
            extraSet: { calledTime: new Date() },
          });
          if (calledNow) {
            changed = true;
            changedCentreIds.add(centre._id.toString());
            changedFarmerIds.add(next.farmerId.toString());
          }
        }
      }

      if (changed) {
        // Target only the centres/farmers this tick actually touched (plus
        // admin/public, which always see every centre's live queue) rather
        // than broadcasting to every connected client — see
        // utils/broadcast.js. (recordProcurementAndSettle already sent its
        // own scoped signal for the procurement path above; this covers
        // the plain waiting->called transition too and is harmless to send
        // twice for the same tick.)
        const rooms = [
          'admin',
          'public',
          ...[...changedCentreIds].map((id) => `centre:${id}`),
          ...[...changedFarmerIds].map((id) => `user:${id}`),
        ];
        io.to(rooms).emit('state:changed');
      }
    } catch (err) {
      console.error('[simulate] tick failed:', err.message);
    }
  }, intervalMs);

  console.log(`[simulate] background queue engine running every ${intervalMs}ms`);
}

module.exports = startSimulation;
