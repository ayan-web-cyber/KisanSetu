const express = require('express');
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { emitToUser } = require('../utils/broadcast');

const router = express.Router();

// POST /api/notifications/mark-all-read — marks the current user's notifications as read
router.post('/mark-all-read', requireAuth, asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  const io = req.app.get('io');
  // Purely personal — no other connected client needs to know.
  emitToUser(io, req.user._id);
  res.json({ ok: true });
}));

module.exports = router;
