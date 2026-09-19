const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

const cropSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    unit: { type: String, required: true },
    rate: { type: Number, required: true },
    status: { type: String, default: 'active' },
  },
  schemaOptions
);

module.exports = mongoose.model('Crop', cropSchema);
