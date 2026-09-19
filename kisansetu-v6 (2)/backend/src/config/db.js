const mongoose = require('mongoose');

// Required at startup — missing any of these must stop the server, not run
// with silently-undefined security configuration.
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'QR_SIGNING_SECRET'];

function checkRequiredEnv() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name] || !process.env[name].trim());
  if (missing.length) {
    console.error(
      `[startup] Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy backend/.env.example to backend/.env and fill in real values.'
    );
    process.exit(1);
  }
}

let transactionsSupported = null; // cached result, read by services that want to know

async function connectDB() {
  checkRequiredEnv();
  const uri = process.env.MONGODB_URI;
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(uri);
    console.log('[db] Connected to MongoDB:', mongoose.connection.name);
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    process.exit(1);
  }

  // Booking creation relies on a multi-document transaction. Every Atlas
  // cluster (free tier included) is a replica set, so this should always
  // succeed there; a standalone local `mongod` will not support it. We
  // don't hard-fail on this (a self-hosted single-node Mongo is still a
  // valid choice for some deployments), but we log loudly so a
  // misconfigured deployment isn't silently missing transaction safety.
  try {
    const session = await mongoose.connection.startSession();
    await session.withTransaction(async () => {});
    await session.endSession();
    transactionsSupported = true;
    console.log('[db] Multi-document transactions are supported by this deployment.');
  } catch (err) {
    transactionsSupported = false;
    console.warn(
      '[db] WARNING: this MongoDB deployment does NOT support multi-document transactions ' +
        '(' + err.message + '). Booking creation atomicity is reduced to its individual ' +
        'atomic operations (findOneAndUpdate) — see routes/bookings.js. Use a replica set ' +
        '(Atlas provides one by default) for full transaction safety.'
    );
  }
}

function isTransactionsSupported() {
  return transactionsSupported;
}

module.exports = connectDB;
module.exports.isTransactionsSupported = isTransactionsSupported;
