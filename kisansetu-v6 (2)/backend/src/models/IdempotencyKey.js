const mongoose = require('mongoose');

// One row per (farmer, client-supplied Idempotency-Key). Created atomically
// in the same transaction as the booking it protects — see
// POST /api/bookings in routes/bookings.js. A retried request with the same
// key returns the original result instead of creating a second booking; the
// same key reused with different booking parameters is rejected (409).
const idempotencyKeySchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  key: { type: String, required: true },
  requestHash: { type: String, required: true }, // hash of the request params this key was used for
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 3 }, // auto-cleaned after 3 days
});

idempotencyKeySchema.index({ farmerId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
