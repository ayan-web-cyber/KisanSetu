// Asia/Kolkata is a fixed UTC+05:30 offset with no DST, so it's safe to
// hard-code the offset rather than depend on the OS/ICU timezone database
// (which may not even have tz data installed on a minimal container image).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Returns a Date object whose UTC-getter fields (getUTCFullYear,
// getUTCMonth, getUTCDate, getUTCDay, ...) reflect the current wall-clock
// date/time in Asia/Kolkata — regardless of what timezone the Node process
// itself is running in (most hosting defaults to UTC). Do not call the
// local (non-UTC) getters on the returned value; they'd re-apply the host's
// own offset on top of the one already added here.
function nowInIST() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Same string shape as JS's built-in Date.prototype.toDateString()
// (e.g. "Fri Aug 28 2026"), but computed from the Asia/Kolkata wall-clock
// date instead of the server process's local timezone. This is a drop-in
// replacement for `new Date().toDateString()` anywhere the backend needs
// "today" as a business date (live-queue filtering, simulation, booking
// cutoff) — without changing the storage format of Slot.date /
// Booking.bookingDate, which stay Date.toDateString()-shaped strings so
// existing data and the browser-side comparisons in script.js (which
// already run in IST for real users) keep matching exactly.
function todayISTDateString() {
  const ist = nowInIST();
  const weekday = WEEKDAYS[ist.getUTCDay()];
  const month = MONTHS[ist.getUTCMonth()];
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const year = ist.getUTCFullYear();
  return `${weekday} ${month} ${day} ${year}`;
}

module.exports = { nowInIST, todayISTDateString, IST_OFFSET_MS };
