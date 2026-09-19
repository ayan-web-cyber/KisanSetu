const mongoose = require('mongoose');

// Generic named atomic counter — one document per counter `name`
// (currently just "farmerId"). Always advanced with findOneAndUpdate +
// $inc, never read-then-written, so two concurrent registrations can
// never be handed the same sequence number. Same pattern as
// TokenCounter, generalized because this one isn't scoped to a
// centre/date.
const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  sequence: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
