# 🌾 KisanSetu

**KisanSetu** is a smart procurement and queue-management web
application designed to help farmers book procurement slots, track their
queue position, receive status updates, and reduce unnecessary waiting
at procurement centres.

This project is a **practice/prototype application**, not a live
government procurement system.

## ✨ Key Features

### 👨‍🌾 Farmer Portal

-   Farmer registration and secure login
-   Farmer profile and farming details
-   View available procurement centres
-   View supported crops and procurement rates
-   Check available dates and time slots
-   Book a procurement slot
-   Receive a token number for the booking
-   View current booking and queue status
-   Cancel eligible bookings
-   Track procurement and payment information
-   View notifications
-   Generate/view booking QR code
-   Voice-based slot booking
-   Switch between manual and voice booking

### 🎙️ Voice Booking

KisanSetu includes a browser-based voice booking flow.

Farmers can use spoken commands such as:

-   "Book a slot"
-   "Book paddy at Amdanga tomorrow at 10 AM"
-   "আমার বুকিং দেখাও"
-   "ধানের স্লট বুক করতে চাই"

The voice system supports: - English and Bengali commands - Crop
recognition - Procurement-centre recognition -
Today/tomorrow/day-after-tomorrow and weekday recognition - Time-slot
recognition - Bengali digit conversion - Voice confirmation before
submitting a booking - Manual fallback when speech recognition is
unavailable

Voice booking uses the **same booking API and booking engine as manual
booking**. It does not create a separate booking system.

> Browser speech recognition support depends on the browser and device.
> A supported browser and microphone permission are required for voice
> input.

### 🏢 Operator Portal

-   Operator login
-   View centre-specific bookings
-   Manage farmer queue
-   Call farmer tokens
-   Move bookings through procurement workflow
-   Scan booking QR codes
-   Update procurement status
-   Process queue operations for the assigned centre

### 🛠️ Admin / Super Admin

-   Administrator login
-   One-time Super Admin setup
-   Manage procurement centres
-   Manage crops
-   Manage slots
-   Manage users/operators
-   Monitor bookings
-   Manage procurement/payment workflows
-   View application state and operational information
-   Audit important actions

### 📺 Real-Time Queue Updates

The application uses **Socket.IO** to notify connected clients when
relevant queue/application state changes.

This helps farmer, operator, and administrator screens stay updated
without relying only on manual page refreshes.

------------------------------------------------------------------------

## 🔐 Security & Reliability

The backend contains several production-hardening measures:

-   JWT-based authentication
-   Password hashing with `bcryptjs`
-   Role-based access control
-   API rate limiting
-   Auth-specific rate limiting
-   MongoDB transactions for booking creation
-   Atomic slot-seat claiming
-   Atomic token-number generation
-   Database-level prevention of duplicate active bookings
-   Idempotency keys for booking requests
-   Atomic booking cancellation
-   Procurement/payment uniqueness constraints
-   Signed QR-code payloads using HMAC-SHA256
-   QR-code expiry validation
-   Input validation and ObjectId validation
-   Scoped application state by user role
-   Global API error handling
-   Audit logging
-   CORS configuration
-   Environment-based secrets

The application also avoids exposing sensitive farmer information
through the public state used by the queue display.

------------------------------------------------------------------------

## 🏗️ Technology Stack

### Frontend

-   HTML5
-   CSS3
-   JavaScript
-   Browser Web Speech API
-   QR Code Generator
-   jsQR

### Backend

-   Node.js
-   Express.js
-   Socket.IO
-   JWT
-   bcryptjs
-   Mongoose

### Database

-   MongoDB
-   MongoDB Atlas recommended

### Architecture

``` text
KisanSetu
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── voice/
│       ├── voiceRecognition.js
│       └── voiceCommandParser.js
│
└── backend/
    ├── server.js
    ├── .env
    ├── package.json
    └── src/
        ├── config/
        ├── middleware/
        ├── models/
        ├── routes/
        ├── services/
        └── utils/
```

------------------------------------------------------------------------

## 🔄 Main Booking Workflow

``` text
Farmer Registration/Login
          ↓
Select Procurement Centre
          ↓
Select Crop
          ↓
Select Date
          ↓
Select Available Time Slot
          ↓
Review Booking
          ↓
Confirm Booking
          ↓
Transaction-Safe Booking Creation
          ↓
Token Number Generated
          ↓
Queue Tracking
          ↓
Called for Procurement
          ↓
In Procurement
          ↓
Payment / Completion
```

### Voice Booking Workflow

``` text
Farmer opens Voice Booking
          ↓
Select English / বাংলা
          ↓
Speak a command
          ↓
Speech → Text
          ↓
Intent + Crop + Centre + Date + Time
          ↓
Validate against real application data
          ↓
Show interpreted booking summary
          ↓
Farmer confirms
          ↓
Same POST /api/bookings endpoint
          ↓
Token generated
```

The application intentionally does **not** silently book from an
incomplete or ambiguous voice command.

------------------------------------------------------------------------

## 🗄️ Main Data Models

The backend contains models for:

-   `User`
-   `Centre`
-   `Crop`
-   `Slot`
-   `Booking`
-   `TokenCounter`
-   `Procurement`
-   `Payment`
-   `Notification`
-   `DailyStat`
-   `AuditLog`
-   `Counter`
-   `IdempotencyKey`

These models handle authentication, procurement-centre configuration,
crop data, slot availability, booking/queue management, procurement,
payment tracking, notifications, statistics, auditing, and request
idempotency.

------------------------------------------------------------------------

## 🚀 Getting Started

### 1. Clone the repository

``` bash
git clone https://github.com/ayan-web-cyber/KisanSetu.git
cd kisansetu
```

### 2. Install backend dependencies

``` bash
cd backend
npm install
```

### 3. Configure environment variables

Update the required values:

``` env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/kisansetu

JWT_SECRET=your_long_random_jwt_secret

QR_SIGNING_SECRET=your_different_long_random_qr_secret

PORT=4000

SIMULATION_INTERVAL_MS=6000

SIMULATION_ENABLED=false
```

### 4. Prepare MongoDB

MongoDB Atlas is recommended.

The application uses MongoDB transactions for booking creation, so the
database deployment must support transactions. MongoDB Atlas is suitable
for this requirement.

### 5. Seed initial master data

From the `backend` directory:

``` bash
npm run seed
```

The seed process creates reference data including:

-   5 procurement centres
-   5 crops
-   5 days of available slots
-   Centre-specific crop availability

The seed script intentionally does **not** create transactional records
such as bookings, procurements, payments, or notifications.

It also does not create permanent demo users. The first application
setup creates the Super Admin.

> **Important:** `npm run seed` clears the application collections
> before rebuilding the seed data. Do not run it against a database
> containing data you want to keep.

### 6. Start the application

Development mode:

``` bash
npm run dev
```

Or normal mode:

``` bash
npm start
```

Open:

``` text
http://localhost:4000
```

The Express server serves both the frontend and backend from the same
application.

------------------------------------------------------------------------

## 👤 First-Time Setup

When the application is started for the first time, use the **Set Up
Super Admin** screen to create the first administrator account.

After that:

1.  Log in through the Administrator Portal.
2.  Configure/manage application data and users.
3.  Farmers can register through the Farmer Portal.
4.  Operators can be created and assigned to procurement centres through
    the administrative workflow.

------------------------------------------------------------------------

## 🌱 Seeded Procurement Centres

The default seed data contains centres in **North 24 Parganas, West
Bengal**:

  Centre                        Village    Example Supported Crops
  ----------------------------- ---------- -------------------------
  Amdanga Procurement Centre    Amdanga    Paddy, Jute
  Barasat Procurement Centre    Barasat    Paddy, Potato, Mustard
  Habra Procurement Centre      Habra      Paddy, Jute, Mustard
  Deganga Procurement Centre    Deganga    Paddy
  Gaighata Procurement Centre   Gaighata   Paddy, Potato, Mustard

The exact crop availability is controlled by the centre's crop
configuration in the database.

------------------------------------------------------------------------

## 📡 API Structure

The main backend API groups include:

``` text
/api/auth
/api/state
/api/bookings
/api/notifications
/api/users
/api/centres
```

Examples of authentication operations include:

``` text
GET  /api/auth/setup-status
POST /api/auth/setup-super-admin
POST /api/auth/register/farmer
POST /api/auth/login
GET  /api/auth/me
PUT  /api/auth/me
```

Booking operations are handled under:

``` text
/api/bookings
```

The frontend communicates with these APIs using authenticated requests
where required.

------------------------------------------------------------------------

## 🔄 Real-Time Communication

Socket.IO is used for real-time application updates.

Authenticated sockets are placed into appropriate rooms such as:

``` text
user:<userId>
centre:<centreId>
admin
public
```

The socket layer is used to notify clients that application state has
changed. Actual protected data is still retrieved through the normal
authenticated API.

------------------------------------------------------------------------

## 🧪 Demo Simulation

A background procurement/queue simulation is available for demonstration
purposes.

It is **disabled by default**:

``` env
SIMULATION_ENABLED=false
```

For a local demo environment, it can be enabled:

``` env
SIMULATION_ENABLED=true
```

The simulation interval can be configured with:

``` env
SIMULATION_INTERVAL_MS=6000
```

Do not enable demo simulation in a real deployment unless you
intentionally want simulated activity.

------------------------------------------------------------------------

## 🎫 QR Code System

Each booking can have a signed QR payload.

The QR system includes:

-   Booking identifier
-   Token number
-   Expiration
-   Cryptographic signature

The backend validates the QR payload before allowing an operator scan
workflow to continue.

The QR signing secret must be different from the JWT secret.

------------------------------------------------------------------------

## 🎙️ Voice Technology

Voice input is intentionally lightweight.

The project uses the browser's native:

``` text
SpeechRecognition
webkitSpeechRecognition
```

No external speech-to-text server is required.

The voice system is divided into two parts:

### `voiceRecognition.js`

Responsible only for:

-   Starting recognition
-   Stopping recognition
-   Interim transcript
-   Final transcript
-   Browser support detection
-   Microphone/speech errors
-   Listening timeout

### `voiceCommandParser.js`

Responsible for:

-   Intent detection
-   Crop matching
-   Centre matching
-   Date matching
-   Time matching
-   Bengali digit conversion
-   Ambiguity detection

Business logic remains in `script.js` and the backend booking API.

------------------------------------------------------------------------

## ⚠️ Known Limitations

-   Browser speech recognition support varies between browsers and
    devices.
-   Voice crop/centre matching is primarily name/substring based rather
    than advanced phonetic matching.
-   Bengali crop recognition uses a predefined alias list for common
    crops.
-   English and Bengali are selected per speech-recognition session; a
    single spoken sentence is not a full mixed-language NLP system.
-   The project has not been load-tested against a real production
    MongoDB cluster from this repository environment.
-   The payment settlement/simulation workflow should be reviewed
    further before being used for real financial transactions.
-   This repository is a prototype/practice project and should not be
    treated as a production government procurement platform without
    further security, compliance, infrastructure, and operational
    review.

------------------------------------------------------------------------

## 🔒 Environment & Secrets

Never commit your real `.env` file.

At minimum, keep these values private:

``` env
MONGODB_URI
JWT_SECRET
QR_SIGNING_SECRET
```

Generate strong random secrets instead of using simple passwords.

Example JWT secret generation:

``` bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use a different secret for QR signing.

------------------------------------------------------------------------

## 📁 Important Files

  File                                     Purpose
  ---------------------------------------- ---------------------------------
  `backend/server.js`                      Main Express + Socket.IO server
  `backend/src/config/db.js`               MongoDB connection
  `backend/src/routes/auth.js`             Authentication and user setup
  `backend/src/routes/bookings.js`         Booking and queue operations
  `backend/src/routes/centres.js`          Procurement-centre operations
  `backend/src/routes/users.js`            User administration
  `backend/src/routes/state.js`            Application state
  `backend/src/models/Booking.js`          Booking data model
  `backend/src/models/Slot.js`             Slot availability
  `backend/src/models/Centre.js`           Procurement-centre data
  `backend/src/models/Crop.js`             Crop data
  `backend/src/utils/qr.js`                QR signing and verification
  `backend/src/utils/broadcast.js`         Real-time update broadcasting
  `backend/src/seed.js`                    Master-data seeding
  `frontend/script.js`                     Main frontend application logic
  `frontend/index.html`                    Frontend entry point
  `frontend/style.css`                     Application styling
  `frontend/voice/voiceRecognition.js`     Browser speech recognition
  `frontend/voice/voiceCommandParser.js`   Voice command parser

------------------------------------------------------------------------

## 🛠️ Useful Commands

From `backend/`:

``` bash
# Install dependencies
npm install

# Development server
npm run dev

# Production-style start
npm start

# Rebuild seed/master data
npm run seed
```

------------------------------------------------------------------------

## 📌 Project Status

**Current status:** Functional practice/prototype application with
manual procurement booking, voice-assisted booking, queue management, QR
workflows, authentication, role-based portals, MongoDB persistence, and
real-time updates.

The voice-booking layer is implemented on top of the existing booking
engine and uses the same backend booking path as manual booking.

------------------------------------------------------------------------

## 🎯 Project Goals

KisanSetu is designed around four main goals:

1.  **Reduce waiting time** at procurement centres.
2.  **Give farmers better visibility** into slot and queue status.
3.  **Simplify booking** through both manual and voice interaction.
4.  **Improve centre operations** through structured queue and
    procurement workflows.

------------------------------------------------------------------------

## 👨‍💻 Project Type

This is a **self-developed practice/project application** created for
learning and demonstrating full-stack development concepts.

It is not an official application of the Government of India, Ministry
of Consumer Affairs, Food & Public Distribution, or any government
procurement agency.

------------------------------------------------------------------------


> **Future Updates:** I may add various other features to this application in the future as the project continues to evolve.

## 📄 License

Add the license that matches how you want to distribute this project.

For example:

``` text
MIT License
```

If you choose MIT, add a `LICENSE` file to the repository as well.

------------------------------------------------------------------------

## ⭐ If You Like This Project

If this project is useful for learning or experimentation, consider
giving the repository a ⭐ on GitHub.
