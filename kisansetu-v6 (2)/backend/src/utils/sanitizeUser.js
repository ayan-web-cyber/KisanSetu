// .lean() queries skip Mongoose's toJSON transform (see models/schemaOptions.js),
// so any User fetched with .lean() still has passwordHash + _id/__v on it.
// Use this wherever a lean-fetched user (or array of users) is sent to the client.
function sanitizeUser(doc) {
  if (!doc) return doc;
  const { _id, __v, passwordHash, ...rest } = doc;
  return { ...rest, id: _id ? _id.toString() : doc.id };
}

function sanitizeUsers(docs) {
  return (docs || []).map(sanitizeUser);
}

module.exports = { sanitizeUser, sanitizeUsers };
