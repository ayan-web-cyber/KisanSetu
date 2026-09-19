const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: 'info' },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  schemaOptions
);

module.exports = mongoose.model('Notification', notificationSchema);
