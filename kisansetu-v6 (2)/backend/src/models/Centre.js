const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

const centreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    village: { type: String, required: true },
    district: { type: String, required: true },
    state: { type: String, required: true },
    capacityPerHour: { type: Number, required: true },
    avgProcessMin: { type: Number, required: true },
    openTime: { type: String, default: '09:00' },
    closeTime: { type: String, default: '17:00' },
    status: { type: String, default: 'active' },
    distance: { type: Number, default: 0 },
    tokenPrefix: { type: String, required: true },

    // Crop-seed catalog: which crops this centre actually procures. Drives
    // both the farmer's crop choice during booking and the crop dropdown an
    // operator sees when recording a procurement — not every centre buys
    // every crop (e.g. a paddy belt centre may not take jute).
    cropIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Crop', default: [] }],
  },
  schemaOptions
);

module.exports = mongoose.model('Centre', centreSchema);
