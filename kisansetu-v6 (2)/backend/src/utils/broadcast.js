// Targeted Socket.IO broadcast helpers. Every server-side "something
// changed" signal goes through here so a client's refetch stays scoped to
// who's actually affected (Part 9): a change at Centre A must not cause a
// browser watching Centre B, or an unrelated farmer, to refetch and
// re-render for nothing.
//
// Important: this only decides WHO gets told to refetch. It never carries
// any data itself, and the actual PII-scoped payload is still only ever
// obtained afterward via GET /api/state, which is where real authorization
// lives (see utils/buildState.js). A client in the wrong room can at worst
// miss a "please refetch" nudge — it can never see another user's data,
// because room membership is not a substitute for that endpoint's own
// per-caller scoping.
//
// Room membership is assigned once per connection in server.js:
//   user:<userId>  — every authenticated socket (farmer, operator, admin)
//   centre:<id>    — operators assigned to that centre
//   admin          — admin / super-admin
//   public         — anonymous connections (the public TV display)

// Booking/procurement/payment events: relevant to the affected farmer, the
// affected centre's operator, admin (sees everything), and the public TV
// display (which shows every centre's live queue). Either id may be
// omitted if not known/relevant at that call site.
function emitScoped(io, { farmerId, centreId } = {}) {
  if (!io) return;
  const rooms = ['admin', 'public'];
  if (farmerId) rooms.push(`user:${farmerId}`);
  if (centreId) rooms.push(`centre:${centreId}`);
  io.to(rooms).emit('state:changed');
}

// Reference-data edits (centre/crop CRUD) with no single farmer/centre to
// target — every connected client's dropdowns/lookups can depend on this,
// so this one stays a real global broadcast.
function emitGlobal(io) {
  if (!io) return;
  io.emit('state:changed');
}

// Purely personal events with no queue/centre relevance (e.g. "mark all
// notifications read") — only that one user needs to know.
function emitToUser(io, userId) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit('state:changed');
}

module.exports = { emitScoped, emitGlobal, emitToUser };
