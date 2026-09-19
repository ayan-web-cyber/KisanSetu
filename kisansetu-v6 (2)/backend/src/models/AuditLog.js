const mongoose = require('mongoose');

// Append-only. Nothing in this codebase updates or deletes an AuditLog
// document once written — there is deliberately no PUT/DELETE route for it,
// and no route exposes it to non-admin roles. Never write passwords, JWTs,
// secrets, bank details, or full QR payloads into `meta`.
const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorRole: { type: String, default: 'system' },
  action: { type: String, required: true }, // e.g. 'booking.created', 'qr.scan.failed'
  entityType: { type: String, default: null },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  centreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Centre', default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
