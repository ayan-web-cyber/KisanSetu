const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

const paymentSchema = new mongoose.Schema(
  {
    procurementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Procurement', required: true },
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Pending', 'Processing', 'Completed', 'Failed'], default: 'Processing' },
    transactionRef: { type: String, default: '' },
    paymentDate: { type: Date, default: null },
  },
  schemaOptions
);

// One procurement -> at most one payment, enforced at the database level.
paymentSchema.index({ procurementId: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);
