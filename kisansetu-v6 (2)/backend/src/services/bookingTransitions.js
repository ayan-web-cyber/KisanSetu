const Booking = require('../models/Booking');

// Centralized booking queueStatus transition table (Part 15 of the hardening
// spec). Before this, `call`, `absent`, `cancel`, and the procurement claim
// each hand-rolled their own status change — `call` and `absent` used plain
// `booking.save()` with no atomic guard (a real race: two simultaneous
// "Call" clicks, or a call landing at the same instant as a cancel, could
// both read the pre-change doc and both save "successfully"), and `absent`
// had no status guard at all, so it could flip an already-completed,
// cancelled, or in-procurement booking to 'absent'. `cancel` and the
// procurement claim (services/procurement.js) already used a conditional
// `findOneAndUpdate`, which is why they were correct before this file
// existed — this just gives every caller that same pattern from one place,
// so the legal-transition table only needs to be defined once.
const ALLOWED_TRANSITIONS = {
  waiting: ['called', 'cancelled', 'absent'],
  called: ['in-procurement', 'cancelled', 'absent'],
  'in-procurement': ['completed', 'failed'],
  // completed, failed, absent, cancelled are terminal statuses — nothing
  // transitions out of them. (Matches the master prompt's explicit
  // "prevent COMPLETED -> WAITING / COMPLETED -> CANCELLED / CANCELLED ->
  // WAITING / FAILED -> PROCUREMENT" list.)
};

function isValidTransition(from, to) {
  return Array.isArray(ALLOWED_TRANSITIONS[from]) && ALLOWED_TRANSITIONS[from].includes(to);
}

// Atomically moves a booking's queueStatus from one of `fromStatuses` to
// `toStatus`, setting any `extraSet` fields in the same update. Returns the
// updated (post-transition) booking document, or `null` if nothing matched
// — meaning the booking doesn't exist, or (far more commonly) someone else
// already moved it out of an eligible status first. Callers treat `null` as
// an ordinary 404/409 outcome, never as a thrown error: "lost the race" is
// expected under concurrency, not a bug.
//
// `fromStatuses -> toStatus` is checked against ALLOWED_TRANSITIONS before
// touching the database. A mismatch throws synchronously — that's a
// programmer error (a route wiring up a transition this table doesn't
// permit), not a runtime data condition, so it's deliberately not folded
// into the same "return null" path as a lost race.
async function transitionBooking(bookingId, { fromStatuses, toStatus, extraSet = {}, session } = {}) {
  const froms = Array.isArray(fromStatuses) ? fromStatuses : [fromStatuses];
  for (const from of froms) {
    if (!isValidTransition(from, toStatus)) {
      throw new Error(`Illegal booking transition: ${from} -> ${toStatus} is not permitted by ALLOWED_TRANSITIONS.`);
    }
  }
  const opts = { new: true };
  if (session) opts.session = session;
  return Booking.findOneAndUpdate(
    { _id: bookingId, queueStatus: { $in: froms } },
    { $set: { queueStatus: toStatus, ...extraSet } },
    opts
  );
}

module.exports = { transitionBooking, isValidTransition, ALLOWED_TRANSITIONS };
