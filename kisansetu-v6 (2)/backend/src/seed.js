/* Seeds MongoDB Atlas with ONLY the reference/master data the app needs to
   function before anyone has touched it: 5 procurement centres in North 24
   Parganas, 5 crops, 5 days of fully-open slots per centre, and the 3 demo
   login accounts (farmer / operator / admin).

   No transactional data is pre-created — zero bookings, zero queue entries,
   zero procurements, zero payments, zero notifications, zero chart history,
   and no background farmers beyond the single demo farmer account. Every
   one of those is expected to be produced by real CRUD calls against the
   running app (booking a slot, calling a token, recording a procurement,
   etc.), and every record gets its id from Mongo's auto-generated
   ObjectId — nothing is pre-assigned or hand-numbered.

   Run with:  npm run seed
   Safe to re-run — it wipes and rebuilds all collections each time. */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const Centre = require('./models/Centre');
const Crop = require('./models/Crop');
const User = require('./models/User');
const Slot = require('./models/Slot');
const Booking = require('./models/Booking');
const Procurement = require('./models/Procurement');
const Payment = require('./models/Payment');
const Notification = require('./models/Notification');
const DailyStat = require('./models/DailyStat');

const TODAY = new Date();
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const DISTRICT = 'North 24 Parganas';
const STATE_NAME = 'West Bengal';

const CROPS_SEED = [
  { name: 'Paddy (Common)', unit: 'kg', rate: 28 },
  { name: 'Paddy (Grade A)', unit: 'kg', rate: 31 },
  { name: 'Jute', unit: 'kg', rate: 52 },
  { name: 'Potato', unit: 'kg', rate: 14 },
  { name: 'Mustard', unit: 'kg', rate: 58 },
];

// Each centre only buys a subset of crops — its crop-seed catalog — not
// every crop everywhere. Named here by crop, resolved to Crop ObjectIds
// once CROPS_SEED has been inserted (see run(), below).
const CENTRE_SEED = [
  { name: 'Amdanga Procurement Centre', village: 'Amdanga', capacityPerHour: 12, distance: 2.4, crops: ['Paddy (Common)', 'Paddy (Grade A)', 'Jute'] },
  { name: 'Barasat Procurement Centre', village: 'Barasat', capacityPerHour: 16, distance: 7.1, crops: ['Paddy (Common)', 'Paddy (Grade A)', 'Potato', 'Mustard'] },
  { name: 'Habra Procurement Centre', village: 'Habra', capacityPerHour: 10, distance: 9.8, crops: ['Paddy (Common)', 'Jute', 'Mustard'] },
  { name: 'Deganga Procurement Centre', village: 'Deganga', capacityPerHour: 8, distance: 12.3, crops: ['Paddy (Common)', 'Paddy (Grade A)'] },
  { name: 'Gaighata Procurement Centre', village: 'Gaighata', capacityPerHour: 14, distance: 15.6, crops: ['Paddy (Common)', 'Potato', 'Mustard'] },
];

const TIME_BLOCKS = [
  ['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'], ['12:00', '13:00'],
  ['14:00', '15:00'], ['15:00', '16:00'], ['16:00', '17:00'],
];

async function run() {
  await connectDB();

  console.log('[seed] Wiping existing collections...');
  await Promise.all([
    Centre.deleteMany({}), Crop.deleteMany({}), User.deleteMany({}), Slot.deleteMany({}),
    Booking.deleteMany({}), Procurement.deleteMany({}), Payment.deleteMany({}),
    Notification.deleteMany({}), DailyStat.deleteMany({}),
  ]);

  console.log('[seed] Creating crops & centres...');
  const crops = await Crop.insertMany(CROPS_SEED.map((c) => ({ ...c, status: 'active' })));
  const cropIdByName = new Map(crops.map((c) => [c.name, c._id]));

  const centres = await Centre.insertMany(
    CENTRE_SEED.map((c, i) => ({
      name: c.name,
      village: c.village,
      district: DISTRICT,
      state: STATE_NAME,
      capacityPerHour: c.capacityPerHour,
      avgProcessMin: Math.round(60 / c.capacityPerHour),
      openTime: '09:00',
      closeTime: '17:00',
      status: 'active',
      distance: c.distance,
      tokenPrefix: 'ABCDE'[i],
      cropIds: c.crops.map((name) => cropIdByName.get(name)),
    }))
  );

  console.log('[seed] Generating 5 days of fully-open slots per centre...');
  const slotDocs = [];
  for (const centre of centres) {
    for (let d = 0; d < 5; d++) {
      const date = addDays(TODAY, d);
      for (const [s, e] of TIME_BLOCKS) {
        const capacity = centre.capacityPerHour;
        slotDocs.push({
          centreId: centre._id,
          date: date.toDateString(),
          start: s,
          end: e,
          capacity,
          availableSlots: capacity, // nothing pre-booked — every slot starts fully open
        });
      }
    }
  }
  await Slot.insertMany(slotDocs);

  // Deliberately no user accounts of any kind — no demo farmer/operator/admin,
  // no pre-created Super Admin. The very first time the app is opened it will
  // show the one-time "Set up Super Admin" screen (see routes/auth.js). Every
  // account after that is created through real registration/CRUD calls:
  // farmers self-register, the Super Admin creates normal admins, and each
  // admin creates the operators for their centres.

  console.log('[seed] Done ✅');
  console.log(
    `[seed] ${centres.length} centres (each with its own crop-seed catalog), ${crops.length} crops, ${slotDocs.length} open slots. ` +
      `0 users, 0 bookings, 0 procurements, 0 payments, 0 notifications, 0 chart history — ` +
      `open the app and use "Set up Super Admin" to create the first account.`
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
