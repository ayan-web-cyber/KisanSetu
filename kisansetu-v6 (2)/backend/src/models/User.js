const mongoose = require('mongoose');
const schemaOptions = require('./schemaOptions');

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['farmer', 'operator', 'admin', 'super-admin'], required: true },
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true }, // universal login identifier across all roles
    email: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // audit: who created this account

    // operator-only — the single centre this operator works at
    centreId: { type: mongoose.Schema.Types.ObjectId, ref: 'Centre', default: null },

    // farmer-only fields
    farmerId: { type: String, default: '' },
    village: { type: String, default: '' },
    district: { type: String, default: '' },
    state: { type: String, default: '' },
    language: { type: String, default: 'en' },
    bankStatus: { type: String, enum: ['Linked', 'Pending'], default: 'Pending' },
    mainCrop: { type: String, default: '' },
    landAcres: { type: String, default: '' },
  },
  schemaOptions
);

// General lookup index — role-filtered queries are common (operator/admin
// listings, the background simulation's operator lookup, etc.). Declared
// as its own explicit index() call rather than the schema's inline
// `index: true` shorthand so it coexists with the partial unique index
// below. Note: Mongoose still logs a "duplicate schema index" warning at
// startup for this pair — it's a known false positive (Mongoose's
// duplicate-index check only looks at the field path, not that these two
// indexes have different options/purpose); both are still sent to MongoDB
// and built correctly. Safe to ignore.
userSchema.index({ role: 1 });

// Singleton guard: at most one 'super-admin' document can ever exist. This is
// a partial unique index — it only applies to documents matching the filter,
// and since every matching document has the same role value, MongoDB rejects
// a second one at the database level. This is what actually prevents two
// concurrent POST /api/auth/setup-super-admin requests from both succeeding;
// the countDocuments() check in the route is just a fast, friendly early exit.
userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'super-admin' } }
);

module.exports = mongoose.model('User', userSchema);
