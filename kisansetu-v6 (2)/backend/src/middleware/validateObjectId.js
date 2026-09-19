const mongoose = require('mongoose');

// Rejects malformed ids with a clean 400 before they ever reach a Mongoose
// query — without this, an invalid id string (or a NoSQL-injection-style
// object payload) throws a raw CastError that, unhandled, becomes a 500 and
// can leak internal details. Usage: router.get('/:id', validateObjectId('id'), handler)
function validateObjectId(...paramNames) {
  const names = paramNames.length ? paramNames : ['id'];
  return (req, res, next) => {
    for (const name of names) {
      const value = req.params[name];
      if (!value || typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value)) {
        return res.status(400).json({ error: `Invalid ${name}.` });
      }
    }
    next();
  };
}

module.exports = validateObjectId;
