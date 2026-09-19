const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

const bookingSchema = new mongoose.Schema(
  {
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    centreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Centre', required: true, index: true },
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    // Crop the farmer said they're bringing, chosen at booking time from the
    // centre's crop-seed catalog (Centre.cropIds). Used both to show the
    // farmer's intent up front and to enforce "one active booking per
    // farmer+centre+crop" (see POST /api/bookings).
    cropId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true, index: true },
    bookingDate: { type: String, required: true }, // Date.toDateString() text, matches Slot.date
    time: { type: String, required: true },
    tokenNumber: { type: String, required: true },
    // Real, unique, scannable QR payload — just { bookingId, token } — generated
    // once, right when the booking is created, and never changes afterwards. It
    // stays valid throughout the booking's life, so a farmer can show/print
    // it any time, and it exists solely so an operator's camera scanner
    // (POST .../scan) can identify this exact booking; the server looks up
    // every other detail (farmer, centre, crop, etc.) from the DB once it
    // has the id. Kept intentionally minimal — see routes/bookings.js.
    // qrGeneratedAt is set alongside it, at booking time.
    qrCode: { type: String, required: true },
    qrGeneratedAt: { type: Date, default: null },

    // top-level booking status (separate from live queue status)
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },

    // Live queue status — this replaces the old client-side
    // `db.queue[bookingId]` map. A booking stays in one of the "active"
    // states (waiting / called / in-procurement) for as long as it's
    // still being worked — nothing here is ever deleted — and only moves
    // to a resolved state (completed or failed) once its payment actually
    // settles one way or the other; 'failed' covers a booking whose
    // procurement was recorded but whose payment did not go through. Once
    // resolved (completed or failed), it's the matching Procurement +
    // Payment records that serve as this booking's permanent transaction
    // history (see the Payments/History pages).
    queueStatus: {
      type: String,
      enum: ['waiting', 'called', 'in-procurement', 'completed', 'failed', 'absent', 'cancelled'],
      default: 'waiting',
      index: true,
    },
    checkInTime: { type: Date, default: null },
    calledTime: { type: Date, default: null },
    completedTime: { type: Date, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  schemaOptions
);

// Database-level backstop for the "one active booking per farmer+centre+crop"
// rule (see POST /api/bookings). The application-level check in the route
// happens first (for a friendly error message), but only this partial
// unique index makes the rule airtight under concurrency: two simultaneous
// requests can both pass the application check before either has written
// anything, but only one of their inserts can win here — the loser gets a
// duplicate-key error, which the route turns into a 409.
bookingSchema.index(
  { farmerId: 1, centreId: 1, cropId: 1 },
  {
    unique: true,
    partialFilterExpression: { queueStatus: { $in: ['waiting', 'called', 'in-procurement'] } },
  }
);

module.exports = mongoose.model('Booking', bookingSchema);
