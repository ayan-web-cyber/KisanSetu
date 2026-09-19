const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

const procurementSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    centreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Centre', required: true },
    cropId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crop', required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    quality: { type: String, default: 'Grade A' },
    rate: { type: Number, required: true },
    gross: { type: Number, required: true },
    deductions: { type: Number, required: true },
    net: { type: Number, required: true },
    status: { type: String, default: 'completed' },
    createdAt: { type: Date, default: Date.now },
  },
  schemaOptions
);

// One booking -> at most one procurement, enforced at the database level so
// two simultaneous "record procurement" requests for the same booking can
// never both succeed (see services/procurement.js).
procurementSchema.index({ bookingId: 1 }, { unique: true });

module.exports = mongoose.model('Procurement', procurementSchema);
