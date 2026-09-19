const AuditLog = require('../models/AuditLog');

// Audit logging must never break the business operation it's recording.
// Fire-and-forget with a caught rejection; log to stderr if it fails.
function audit(entry) {
  AuditLog.create(entry).catch((err) => {
    console.error('[audit] failed to write audit log:', err.message);
  });
}

module.exports = { audit };
