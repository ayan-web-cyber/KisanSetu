const mongoose = require('mongoose');

// One document per (centre, business date). `sequence` is only ever moved
// forward with an atomic $inc (see routes/bookings.js), never read-then-
// written, so two concurrent booking requests for the same centre/day can
// never be handed the same token number.
const tokenCounterSchema = new mongoose.Schema({
  centreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Centre', required: true },
  date: { type: String, required: true }, // matches Slot.date / Booking.bookingDate
  sequence: { type: Number, default: 90 }, // preserves the existing "90 + n" display format
});

tokenCounterSchema.index({ centreId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('TokenCounter', tokenCounterSchema);
