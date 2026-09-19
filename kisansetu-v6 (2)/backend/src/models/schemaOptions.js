// Shared toJSON behaviour so every model exposes a plain `id` string
// (matching the field name the original demo's frontend already uses)
// instead of Mongo's `_id` ObjectId. Also strips `passwordHash` off of
// User documents wherever they go through .toJSON()/.toObject() (e.g.
// res.json({ user })), so a hash never accidentally reaches the client.
const schemaOptions = {
  timestamps: false,
  toJSON: {
    virtuals: true,
    transform(_doc, ret) {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform(_doc, ret) {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      return ret;
    },
  },
};

module.exports = schemaOptions;
