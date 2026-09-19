const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign(
    { userId: user.id || user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
