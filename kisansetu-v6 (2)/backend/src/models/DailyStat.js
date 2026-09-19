const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

// Pre-computed 14-day procurement volume/value trend used by the admin
// analytics charts. Seeded once so the numbers stay stable between requests
// instead of being randomly regenerated on every page load.
const dailyStatSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    label: { type: String, required: true },
    qty: { type: Number, required: true },
    value: { type: Number, required: true },
  },
  schemaOptions
);

module.exports = mongoose.model('DailyStat', dailyStatSchema);
