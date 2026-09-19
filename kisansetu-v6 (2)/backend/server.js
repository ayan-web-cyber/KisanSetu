require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const connectDB = require('./src/config/db');
const startSimulation = require('./src/simulate');
const rateLimit = require('./src/middleware/rateLimit');
const { verifyToken } = require('./src/utils/jwt');
const User = require('./src/models/User');

const authRoutes = require('./src/routes/auth');
const stateRoutes = require('./src/routes/state');
const bookingRoutes = require('./src/routes/bookings');
const notificationRoutes = require('./src/routes/notifications');
const userRoutes = require('./src/routes/users');
const centreRoutes = require('./src/routes/centres');

async function main() {
  await connectDB();

  const app = express();
  // trust the first proxy hop (needed for req.ip to be the real client IP,
  // not the load balancer's, when deployed behind one) — harmless locally.
  app.set('trust proxy', 1);

  const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
  app.use(express.json({ limit: '200kb' }));

  // General API-wide rate limit — generous enough not to interfere with
  // normal use (including Socket.IO's own HTTP polling fallback and the
  // frontend's periodic state refresh), but bounds abuse/scraping.
  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300 }));

  // Tighter limits on auth endpoints specifically — these are the ones
  // worth protecting against credential stuffing / brute force / setup
  // spam. Keyed by IP + attempted mobile number so one abusive IP can't
  // lock out unrelated accounts, and one leaked mobile number can't be
  // hammered from many IPs without eventually tripping the IP-only /api
  // limiter above either.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyFn: (req) => `${req.ip}:${(req.body && req.body.mobile) || ''}`,
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register/farmer', authLimiter);
  app.use('/api/auth/setup-super-admin', authLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/state', stateRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/centres', centreRoutes);

  // Serve the frontend (index.html / style.css / script.js) from the same server
  // so there's no CORS to configure — just open http://localhost:PORT
  const frontendDir = path.join(__dirname, '..', 'frontend');
  app.use(express.static(frontendDir));

  // Unmatched /api/* routes get a clean 404 instead of falling through to
  // sendFile(index.html) below.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
  });

  // Global error handler — must be registered last, after every route.
  // Catches anything a route handler throws/rejects that it didn't already
  // turn into a res.status(...).json(...) itself (e.g. an unexpected
  // Mongoose CastError). Never leaks a stack trace or raw driver error to
  // the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[unhandled]', err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: 'Something went wrong. Please try again.' });
  });

  const server = http.createServer(app);
  const io = new Server(server, { cors: allowedOrigins.length ? { origin: allowedOrigins } : { origin: '*' } });
  app.set('io', io);

  // Every socket is placed into a room at connect time based on who (if
  // anyone) is authenticated, so the emit helpers in utils/broadcast.js can
  // target just the clients a given change actually affects (Part 9) —
  // instead of the previous behaviour of one global io.emit() that made
  // every connected browser refetch on every single change anywhere in the
  // system. This never grants a socket access to any data by itself; it
  // only decides who gets a "please refetch" nudge. The actual data is
  // still fetched afterward over the normal authenticated REST API.
  io.on('connection', async (socket) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (token) {
        const payload = verifyToken(token);
        const user = await User.findById(payload.userId);
        if (user && user.status !== 'suspended') {
          socket.join(`user:${user._id}`);
          if (user.role === 'operator' && user.centreId) {
            socket.join(`centre:${user.centreId}`);
          } else if (user.role === 'admin' || user.role === 'super-admin') {
            socket.join('admin');
          }
        } else {
          socket.join('public');
        }
      } else {
        socket.join('public');
      }
    } catch (err) {
      // Invalid/expired token at connect time — treat the socket as
      // anonymous rather than dropping the connection outright. A stale
      // token shouldn't break the public TV display for that browser; the
      // REST API is where an expired token actually gets rejected.
      socket.join('public');
    }
    socket.on('disconnect', () => {});
  });

  // Demo/queue simulation must be explicitly opted into — see
  // .env.example. Never runs by default, so a real deployment can't
  // accidentally have fake procurement/payment activity running.
  if ((process.env.SIMULATION_ENABLED || '').toLowerCase() === 'true') {
    startSimulation(io);
  } else {
    console.log('[simulate] SIMULATION_ENABLED is not "true" — background demo simulation is OFF.');
  }

  const port = process.env.PORT || 4000;
  server.listen(port, () => {
    console.log(`[server] KisanSetu running at http://localhost:${port}`);
  });

  function shutdown(signal) {
    console.log(`[server] ${signal} received, shutting down...`);
    server.close(() => {
      require('mongoose').connection.close(false).finally(() => process.exit(0));
    });
    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// A route handler that forgets to catch a rejected promise would otherwise
// crash the process silently (Express 4 does not auto-catch async errors).
// Logging here is a safety net, not a substitute for handling errors at
// the route — see server.js's global error-handling middleware above for
// requests already inside Express.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

main().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
