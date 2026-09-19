const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

const slotSchema = new mongoose.Schema(
  {
    centreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Centre', required: true, index: true },
    // Stored as JS Date.toDateString() text (e.g. "Fri Aug 28 2026") so it can be
    // compared directly against the same format the browser produces client-side.
    date: { type: String, required: true, index: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    capacity: { type: Number, required: true },
    availableSlots: { type: Number, required: true },
  },
  schemaOptions
);

module.exports = mongoose.model('Slot', slotSchema);
