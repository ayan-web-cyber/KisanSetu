/* =========================================================
   KisanSetu — Smart Procurement Management System
   Frontend now talks to a real Node/Express + MongoDB backend
   (see /backend). Live queue updates arrive over Socket.IO from a
   server-side simulation engine, so the app stays "live" across
   every connected browser/device, not just the current tab.
   ========================================================= */

/* ---------------- utilities ---------------- */
let __id = 1000;
function uid(prefix){ __id++; return (prefix||'ID')+'-'+__id; }
function fmtINR(n){ return '₹' + Math.round(n).toLocaleString('en-IN'); }
function pad(n){ return n<10 ? '0'+n : ''+n; }
function fmtDate(d){ return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtTime(d){ let h=d.getHours(),m=d.getMinutes(); let ap=h>=12?'PM':'AM'; let hh=h%12; if(hh===0)hh=12; return pad(hh)+':'+pad(m)+' '+ap; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function sameDay(a,b){ return a.toDateString()===b.toDateString(); }
function esc(s){ return (s+'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

const TODAY = new Date();

/* ---------------- i18n (nav / key labels only — demo scope) ---------------- */
const I18N = {
  en:{app:'KisanSetu', tagline:'Smart Procurement Management System',
    nav_dashboard:'Dashboard', nav_book:'Book Slot', nav_queue:'My Queue', nav_payments:'Payments',
    nav_history:'History', nav_notifications:'Notifications', nav_profile:'Profile',
    nav_liveq:'Live Queue', nav_reports:'Reports', nav_farmers:'Farmers', nav_centres:'Centres',
    nav_bookings:'Bookings', nav_queues:'Queues', nav_analytics:'Analytics', nav_settings:'Settings',
    nav_operators:'Operators', nav_admins:'Manage Admins', nav_crops:'Manage Crops',
    welcome:'Welcome', now_serving:'Now Serving', your_token:'Your Token', people_ahead:'People Ahead',
    est_wait:'Estimated Wait'
  },
  hi:{app:'किसानसेतु', tagline:'स्मार्ट खरीद प्रबंधन प्रणाली',
    nav_dashboard:'डैशबोर्ड', nav_book:'स्लॉट बुक करें', nav_queue:'मेरी कतार', nav_payments:'भुगतान',
    nav_history:'इतिहास', nav_notifications:'सूचनाएं', nav_profile:'प्रोफ़ाइल',
    nav_liveq:'लाइव कतार', nav_reports:'रिपोर्ट', nav_farmers:'किसान', nav_centres:'केंद्र',
    nav_bookings:'बुकिंग', nav_queues:'कतारें', nav_analytics:'विश्लेषण', nav_settings:'सेटिंग्स',
    nav_operators:'ऑपरेटर', nav_admins:'व्यवस्थापक प्रबंधित करें', nav_crops:'फसलें प्रबंधित करें',
    welcome:'स्वागत है', now_serving:'अभी सेवा में', your_token:'आपका टोकन', people_ahead:'आगे लोग',
    est_wait:'अनुमानित प्रतीक्षा'
  },
  bn:{app:'কিষাণসেতু', tagline:'স্মার্ট সংগ্রহ ব্যবস্থাপনা সিস্টেম',
    nav_dashboard:'ড্যাশবোর্ড', nav_book:'স্লট বুক করুন', nav_queue:'আমার সারি', nav_payments:'পেমেন্ট',
    nav_history:'ইতিহাস', nav_notifications:'বিজ্ঞপ্তি', nav_profile:'প্রোফাইল',
    nav_liveq:'লাইভ সারি', nav_reports:'রিপোর্ট', nav_farmers:'কৃষক', nav_centres:'কেন্দ্র',
    nav_bookings:'বুকিং', nav_queues:'সারিসমূহ', nav_analytics:'বিশ্লেষণ', nav_settings:'সেটিংস',
    nav_operators:'অপারেটর', nav_admins:'অ্যাডমিন পরিচালনা', nav_crops:'ফসল পরিচালনা',
    welcome:'স্বাগতম', now_serving:'এখন পরিষেবা চলছে', your_token:'আপনার টোকেন', people_ahead:'সামনে লোক',
    est_wait:'আনুমানিক অপেক্ষা'
  }
};
function t(key){ return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key; }

/* ---------------- API layer ---------------- */
const API_BASE = '/api';

function getStoredToken(){ return localStorage.getItem('ks_token'); }
function setStoredToken(token){ if(token) localStorage.setItem('ks_token', token); else localStorage.removeItem('ks_token'); }

async function apiFetch(path, opts){
  opts = opts || {};
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  const token = getStoredToken();
  if(token) headers['Authorization'] = 'Bearer '+token;
  let res;
  try{
    res = await fetch(API_BASE+path, Object.assign({}, opts, {headers}));
  }catch(err){
    toast('Could not reach the server. Is the backend running?','err');
    throw err;
  }
  let data = null;
  try{ data = await res.json(); }catch(e){ /* no body */ }
  if(!res.ok){
    const msg = (data && data.error) || ('Request failed ('+res.status+')');
    toast(msg,'err');
    throw new Error(msg);
  }
  return data;
}

// Converts ISO date strings coming back from JSON into real Date objects,
// matching what the original in-memory seed produced, so every render
// function that calls fmtDate()/fmtTime()/toLocaleString() on these fields
// keeps working unchanged.
function hydrateDates(db){
  const asDate = v => v ? new Date(v) : v;
  (db.bookings||[]).forEach(b=>{ b.createdAt=asDate(b.createdAt); b.checkInTime=asDate(b.checkInTime); b.calledTime=asDate(b.calledTime); b.completedTime=asDate(b.completedTime); });
  (db.procurements||[]).forEach(p=>{ p.createdAt=asDate(p.createdAt); });
  (db.payments||[]).forEach(p=>{ p.paymentDate=asDate(p.paymentDate); });
  (db.notifications||[]).forEach(n=>{ n.createdAt=asDate(n.createdAt); });
  (db.history14||[]).forEach(h=>{ h.date=asDate(h.date); });
  Object.keys(db.queue||{}).forEach(id=>{
    const q = db.queue[id];
    q.checkInTime=asDate(q.checkInTime); q.calledTime=asDate(q.calledTime); q.completedTime=asDate(q.completedTime);
  });
  return db;
}

// Fetches the full data bundle from MongoDB (via the backend) and swaps it
// into state.db, then re-renders. Called after every mutation and whenever
// a 'state:changed' event arrives over Socket.IO from another client or
// from the server's background simulation.
async function loadState(){
  const db = await apiFetch('/state');
  state.db = hydrateDates(db);
}


/* ---------------- global state ---------------- */
const DISTRICT = 'North 24 Parganas';
const EMPTY_DB = { centres:[], crops:[], farmers:[], slots:[], bookings:[], queue:{}, procurements:[], payments:[], notifications:[], history14:[] };
const state = {
  lang:'en',
  authed:false, role:null, userId:null,
  route:'landing',
  db: EMPTY_DB,
  bookingWizard:{ step:1, district:DISTRICT, centreId:null, cropId:null, date:null, slotId:null, idemKey:null, submitting:false },
  // Voice booking: a "draft" the voice parser fills in over one or more
  // utterances, entirely separate from bookingWizard until the farmer
  // explicitly applies it (see applyVoiceDraftToWizard) — voice never
  // writes to bookingWizard directly, so a misheard word can't silently
  // change a selection the farmer already made manually.
  voice:{
    open:false, lang:'en-IN', listening:false, autoListen:false,
    transcript:'', interim:'', error:null,
    draft:{ cropId:null, cropName:null, centreId:null, centreName:null, dateDs:null, dateLabel:null, slotId:null, slotLabel:null },
    awaitingConfirm:false, needText:null,
  },
  operatorCentreId:null,
  modal:null,
  search:'', filters:{},
  setupNeeded:null, // null = not checked yet; true = no Super Admin exists yet
  authForm:{}, authError:'',
  admins:[], operators:[], // loaded on demand for the Super Admin / Admin management pages
  adminsLoaded:false, operatorsLoaded:false,
  adminForm:{}, editingAdminId:null, adminFormError:'', showAdminForm:false,
  operatorForm:{}, editingOperatorId:null, operatorFormError:'', showOperatorForm:false,
  centreForm:{}, editingCentreId:null, centreFormError:'', showCentreForm:false,
  cropForm:{}, editingCropId:null, cropFormError:'', showCropForm:false,
  profileForm:{}, profileFormError:'', showProfileForm:false,
};

function currentFarmer(){ return state.db.farmers.find(f=>f.id===state.userId); }
function centreById(id){ return state.db.centres.find(c=>c.id===id); }
function cropById(id){ return state.db.crops.find(c=>c.id===id); }
function farmerById(id){ return state.db.farmers.find(f=>f.id===id); }
function bookingById(id){ return state.db.bookings.find(b=>b.id===id); }

/* ---------------- toast ---------------- */
function toast(msg, type){
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + (type||'');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=>el.remove(),300); }, 3800);
}

// Notifications are now created server-side (as a side effect of booking,
// calling, marking absent, completing procurement, and payment settlement)
// and arrive via loadState()/Socket.IO — there's no client-side equivalent.

/* ---------------- queue engine ---------------- */
function activeQueueList(centre){
  // "active" = still consuming a queue slot (waiting or currently called/in-procurement)
  return centre.queueOrder.filter(bid=>{
    const q = state.db.queue[bid];
    return q && (q.status==='waiting' || q.status==='called' || q.status==='in-procurement');
  });
}
function queuePositionInfo(centre, bookingId){
  const list = activeQueueList(centre);
  const idx = list.indexOf(bookingId);
  if(idx===-1) return null;
  const peopleAhead = idx; // entries before this one (includes the one currently being served)
  const estWait = peopleAhead * (centre.avgProcessMin||5);
  return { position: idx+1, peopleAhead, estWait };
}
function nowServingToken(centre){
  const bid = centre.nowServingBookingId;
  if(!bid) return null;
  const b = bookingById(bid);
  return b ? b.tokenNumber : null;
}
function nextWaitingToken(centre){
  const list = activeQueueList(centre).filter(bid=> state.db.queue[bid].status==='waiting');
  if(!list.length) return null;
  return bookingById(list[0]).tokenNumber;
}

function callNext(centreId){
  const centre = centreById(centreId);
  const list = activeQueueList(centre);
  const nextId = list.find(bid=> state.db.queue[bid].status==='waiting');
  if(!nextId){ toast('No farmers waiting in this queue.','err'); return; }
  callBooking(nextId);
}
async function callBooking(bookingId){
  try{
    await apiFetch('/bookings/'+bookingId+'/call', {method:'POST'});
    toast('Called token', 'ok');
    await loadState();
    render();
  }catch(err){ /* toast already shown by apiFetch */ }
}
// Entry point for the operator's "Verify" action, done after a farmer has
// already been called and is standing at the counter. There's no QR shown
// anywhere on the operator portal — the only QR involved is the one on the
// farmer's own ticket, scanned here to confirm the person at the counter
// really is the holder of this exact called token, before any procurement
// or payment can begin.
function initiateVerifyByScan(bookingId){
  const b = bookingById(bookingId);
  if(!b){ toast('Booking not found.','err'); return; }
  openScanModal(bookingId, b.tokenNumber);
}

async function markAbsent(bookingId){
  try{
    await apiFetch('/bookings/'+bookingId+'/absent', {method:'POST'});
    toast('Token marked absent', 'err');
    await loadState();
    render();
  }catch(err){ /* toast already shown */ }
}

function openProcurementModal(bookingId){
  const b = bookingById(bookingId);
  // Default to the crop the farmer said they'd bring at booking time; the
  // operator can still change it to anything else in the centre's catalog.
  const defaultCropId = (b && b.cropId) || centreCropCatalog(centreById(b && b.centreId))[0]?.id || (state.db.crops[0] && state.db.crops[0].id);
  state.modal = { type:'procurement', bookingId, cropId: defaultCropId, quantity:'', quality:'Grade A', deductionsPct:1 };
  render();
}
// Crops this centre actually procures (its crop-seed catalog), falling
// back to the full crop list if a centre somehow has none set.
function centreCropCatalog(centre){
  if(!centre) return state.db.crops;
  const ids = centre.cropIds||[];
  const list = state.db.crops.filter(c=>ids.includes(c.id));
  return list.length ? list : state.db.crops;
}

/* ---------------- operator: camera QR scanner ----------------
   Lets the operator scan the QR on a farmer's ticket with the device
   camera, decoded in-browser via jsQR — no photo is ever uploaded
   anywhere. This is the ONLY place a QR code is involved anywhere in the
   operator portal — nothing is ever printed or displayed for the operator
   to show; they only ever read the farmer's own QR back.
   The token is already called (see callBooking) by the time this runs —
   scanning here is a separate, later step, done once the farmer is
   actually standing at the counter. Its purpose is to verify the person
   in front of the operator really is the holder of this exact called
   token (expectedBookingId below) before any procurement or payment can
   begin. A scan of a different token is rejected with a mismatch message
   instead of silently proceeding. */
let scanStream = null, scanRAF = null, scanBusy = false;

function openScanModal(expectedBookingId, expectedToken){
  if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){
    toast('Camera access is not available in this browser.','err'); return;
  }
  if(typeof jsQR !== 'function'){
    toast('QR scanner failed to load. Check your connection and try again.','err'); return;
  }
  scanBusy = false;
  state.modal = {
    type:'scan',
    expectedBookingId, expectedToken,
    status: expectedToken ? `Scan token ${expectedToken}'s QR to verify it's them…` : "Point the camera at the farmer's QR token…",
  };
  render();
  startScanCamera();
}
function setScanStatus(msg){
  if(state.modal && state.modal.type==='scan') state.modal.status = msg;
  const el = document.getElementById('scanStatus');
  if(el) el.textContent = msg;
}
async function startScanCamera(){
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
  }catch(err){
    toast('Could not access the camera. Check permissions and try again.','err');
    closeScanModal();
    return;
  }
  const video = document.getElementById('scanVideo');
  if(!video){ stopScanCamera(); return; } // modal was closed before the camera came up
  video.srcObject = scanStream;
  await video.play().catch(()=>{});
  scanRAF = requestAnimationFrame(scanTick);
}
function scanTick(){
  if(!(state.modal && state.modal.type==='scan')) return; // modal closed mid-scan
  const video = document.getElementById('scanVideo');
  const canvas = document.getElementById('scanCanvas');
  if(video && canvas && video.readyState===video.HAVE_ENOUGH_DATA && !scanBusy){
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(frame.data, frame.width, frame.height);
    if(code && code.data){ handleScanResult(code.data); return; }
  }
  scanRAF = requestAnimationFrame(scanTick);
}
function stopScanCamera(){
  if(scanRAF) cancelAnimationFrame(scanRAF);
  scanRAF = null;
  if(scanStream){ scanStream.getTracks().forEach(tr=>tr.stop()); scanStream = null; }
}
function closeScanModal(){
  stopScanCamera();
  state.modal = null;
  render();
}
// Shared close handler for the ✕ button and background-click on any modal
// — routes to closeScanModal() when it's the camera scanner (so the camera
// track actually stops), otherwise just clears it like before.
function closeAnyModal(){
  if(state.modal && state.modal.type==='scan'){ closeScanModal(); return; }
  if(state.modal && state.modal.type==='voice'){ closeVoiceModal(); return; }
  state.modal = null;
  render();
}
async function handleScanResult(text){
  scanBusy = true;
  let payload;
  // jsQR hands back byte-mode QR data as one raw byte per char (no UTF-8
  // decoding), the mirror image of the unescape(encodeURIComponent(...))
  // encoding used in svgQrTag() when the code was generated. Reverse that
  // before parsing so this keeps working if the payload ever carries
  // non-ASCII text again; for today's plain-ASCII payload this is a no-op.
  try{ payload = JSON.parse(decodeURIComponent(escape(text))); }
  catch(e){ try{ payload = JSON.parse(text); }catch(e2){ payload = null; } }
  if(!payload || !payload.bookingId){
    setScanStatus('That QR code is not a KisanSetu token — keep trying.');
    scanBusy = false; scanRAF = requestAnimationFrame(scanTick);
    return;
  }
  // Verify this is actually the token the operator meant to call — not
  // just any valid QR that happens to be in front of the camera.
  const expected = state.modal && state.modal.expectedBookingId;
  if(expected && payload.bookingId !== expected){
    setScanStatus('This is token '+(payload.token||'?')+', not '+(state.modal.expectedToken||'the expected token')+'. Scan the right farmer\'s ticket.');
    scanBusy = false; scanRAF = requestAnimationFrame(scanTick);
    return;
  }
  setScanStatus('Token '+(payload.token||'')+' verified — opening procurement form…');
  try{
    // Send the FULL decoded QR payload (bookingId, token, exp, sig) — the
    // server verifies the signature/expiry itself rather than trusting
    // that a request for this URL implies a real, unmodified QR was
    // scanned. See utils/qr.js on the backend.
    const res = await apiFetch('/bookings/'+payload.bookingId+'/scan', { method:'POST', body: JSON.stringify({ payload }) });
    stopScanCamera();
    await loadState();
    toast('Token '+(payload.token||'')+' verified — record the produce below.', 'ok');
    openProcurementModal(res.bookingId);
  }catch(err){
    // apiFetch already toasted the specific error (wrong centre, already
    // completed, etc.) — stay on the scanner so the operator can retry.
    scanBusy = false;
    if(state.modal && state.modal.type==='scan'){ scanRAF = requestAnimationFrame(scanTick); }
  }
}

async function submitProcurement(){
  const m = state.modal;
  const quantity = parseFloat(m.quantity)||0;
  if(quantity<=0){ toast('Enter a valid quantity','err'); return; }
  try{
    await apiFetch('/bookings/'+m.bookingId+'/procurement', {
      method:'POST',
      body: JSON.stringify({ cropId:m.cropId, quantity, quality:m.quality, deductionsPct:m.deductionsPct })
    });
    toast('Procurement completed', 'ok');
    state.modal = null;
    await loadState();
    render();
    // Payment settles ~7s later server-side; the server broadcasts
    // 'state:changed' again when it does, so the client picks it up
    // automatically via the socket listener below.
  }catch(err){ /* toast already shown */ }
}

async function cancelBooking(bookingId){
  try{
    await apiFetch('/bookings/'+bookingId+'/cancel', {method:'POST'});
    toast('Booking cancelled', 'ok');
    await loadState();
    render();
  }catch(err){ /* toast already shown */ }
}

/* ---------------- FARMER: voice booking ----------------
   Voice commands only ever drive the SAME booking wizard state
   (state.bookingWizard) and the SAME booking API (createBooking(),
   which posts to POST /api/bookings) as manual booking — see
   applyVoiceDraftToWizard() below, the one function allowed to write
   into bookingWizard from here. There is no separate voice booking
   endpoint or booking-creation code path. Speech is untrusted input:
   nothing here ever calls createBooking() except in direct response
   to an explicit "confirm"/"yes" spoken while the interpreted
   summary is already on screen, or an explicit tap of the Confirm
   button — see the CONFIRM_BOOKING handling in handleVoiceFinal(). */

// Builds the same "what can voice currently match against" context the
// manual wizard itself would offer at this point — so voice can never
// select a crop/centre/date/slot the manual UI wouldn't also allow.
function voiceCtx(){
  const dates = [0,1,2,3,4].map(n=>{
    const d = addDays(TODAY, n);
    return { date:d, ds:d.toDateString(), label: n===0?'Today': n===1?'Tomorrow': fmtDate(d) };
  });
  const v = state.voice.draft;
  const centre = v.centreId ? centreById(v.centreId) : null;
  const crops = centre ? centreCropCatalog(centre) : state.db.crops;
  const slots = (v.centreId && v.dateDs) ? state.db.slots.filter(s=>s.centreId===v.centreId && s.date===v.dateDs) : [];
  return { crops, centres: state.db.centres, availableDates: dates, slots };
}
// Pre-fills the voice draft from whatever the farmer already picked
// manually, so switching into voice mid-wizard continues the same
// booking instead of starting over (hybrid voice+manual mode).
function syncVoiceDraftFromWizard(){
  const w = state.bookingWizard, v = state.voice.draft;
  if(w.centreId){ const c=centreById(w.centreId); v.centreId=w.centreId; v.centreName=c?c.name:null; }
  if(w.cropId){ const c=cropById(w.cropId); v.cropId=w.cropId; v.cropName=c?c.name:null; }
  if(w.date){ v.dateDs=w.date; v.dateLabel=fmtDate(new Date(w.date)); }
  if(w.slotId){ const s=state.db.slots.find(s=>s.id===w.slotId); v.slotId=w.slotId; v.slotLabel=s?(s.start+' - '+s.end):null; }
}
function resetVoiceDraft(){
  state.voice.draft = { cropId:null, cropName:null, centreId:null, centreName:null, dateDs:null, dateLabel:null, slotId:null, slotLabel:null };
}
function openVoiceModal(){
  if(state.role!=='farmer') return; // guard — the button only ever renders on farmer screens anyway
  const v = state.voice;
  v.open = true; v.transcript=''; v.interim=''; v.error=null; v.awaitingConfirm=false; v.needText=null;
  v.lang = state.lang==='bn' ? 'bn-IN' : 'en-IN'; // follow the farmer's existing language preference by default
  syncVoiceDraftFromWizard();
  state.modal = { type:'voice' };
  render();
}
function closeVoiceModal(){
  KSVoiceRecognition.stop();
  state.voice.listening = false; state.voice.autoListen = false;
  state.modal = null;
  render();
}
function setVoiceLang(lang){
  state.voice.lang = lang;
  if(state.voice.listening){ KSVoiceRecognition.stop(); startVoiceListening(); }
  else render();
}
function voiceErrorMessage(reason){
  switch(reason){
    case 'not-allowed': case 'service-not-allowed':
      return "Microphone permission was denied. Please allow microphone access, or choose manually.";
    case 'no-speech':
      return "I didn't hear anything. Please try again or choose manually.";
    case 'unsupported':
      return "Voice booking isn't supported in this browser. Please continue with manual booking.";
    case 'network':
      return "Network problem while listening. Please check your connection and try again.";
    default:
      return "I couldn't understand that. Please try again or choose manually.";
  }
}
function startVoiceListening(){
  if(!KSVoiceRecognition.isSupported()){
    state.voice.error = voiceErrorMessage('unsupported'); render(); return;
  }
  const v = state.voice;
  v.error = null; v.interim = ''; v.listening = true; v.autoListen = true;
  render();
  KSVoiceRecognition.start({
    lang: v.lang,
    onInterim: function(text){ state.voice.interim = text; render(); },
    onFinal: function(text){ handleVoiceFinal(text); },
    onError: function(reason){
      state.voice.listening = false; state.voice.autoListen = false;
      state.voice.error = voiceErrorMessage(reason);
      render();
    },
    onEnd: function(){
      state.voice.listening = false;
      // Keep a hands-free back-and-forth going while we're still
      // gathering fields; stop auto-restarting once the interpreted
      // booking is up for confirmation, so a stray extra word can't
      // quietly feed another command into an already-complete draft.
      const shouldContinue = state.voice.autoListen && !state.voice.awaitingConfirm && state.modal && state.modal.type==='voice';
      if(shouldContinue){
        setTimeout(function(){
          if(state.voice.autoListen && !state.voice.listening && state.modal && state.modal.type==='voice') startVoiceListening();
        }, 400);
      }
      render();
    }
  });
}
function stopVoiceListening(){
  state.voice.autoListen = false;
  KSVoiceRecognition.stop();
  state.voice.listening = false;
  render();
}
// The one function allowed to write voice-recognized fields into the
// real booking wizard. Never calls createBooking() itself.
function applyVoiceDraftToWizard(){
  const v = state.voice.draft, w = state.bookingWizard;
  if(v.centreId) w.centreId = v.centreId;
  if(v.cropId) w.cropId = v.cropId;
  if(v.dateDs) w.date = v.dateDs;
  if(v.slotId) w.slotId = v.slotId;
  w.idemKey = null;
  w.step = !w.centreId ? 1 : !w.cropId ? 2 : !w.date ? 3 : !w.slotId ? 4 : 5;
}
// "Continue" in the voice panel — apply what's resolved so far and drop
// into the manual wizard at the right step for whatever's left (hybrid mode).
function voiceContinueManually(){
  applyVoiceDraftToWizard();
  closeVoiceModal();
  navigate('farmer/book');
}
function handleVoiceFinal(text){
  const v = state.voice;
  v.transcript = text; v.interim = '';
  const parsed = KSVoiceParser.parse(text, voiceCtx());

  if(parsed.empty){
    v.error = "I couldn't understand that. Please try again or choose manually.";
    render(); return;
  }
  v.error = null;

  if(parsed.intent==='CANCEL' || parsed.intent==='CANCEL_BOOKING'){ resetVoiceDraft(); v.awaitingConfirm=false; render(); return; }
  if(parsed.intent==='EDIT_BOOKING'){ v.awaitingConfirm=false; render(); return; }
  if(parsed.intent==='DASHBOARD'){ closeVoiceModal(); navigate('farmer/dashboard'); return; }
  if(parsed.intent==='MY_BOOKINGS'){ closeVoiceModal(); navigate('farmer/queue'); return; }

  // Apply whatever entities were recognized — a single utterance like
  // "book paddy tomorrow at 10 am" carries several at once.
  if(parsed.crop){ v.draft.cropId = parsed.crop.id; v.draft.cropName = parsed.crop.name; }
  if(parsed.centre){
    v.draft.centreId = parsed.centre.id; v.draft.centreName = parsed.centre.name;
    // A new centre can invalidate a crop/slot picked against the old one
    // — re-validate instead of silently carrying a stale selection.
    const catalog = centreCropCatalog(centreById(v.draft.centreId)).map(c=>c.id);
    if(v.draft.cropId && !catalog.includes(v.draft.cropId)){ v.draft.cropId=null; v.draft.cropName=null; }
    v.draft.slotId = null; v.draft.slotLabel = null;
  }
  if(parsed.date){ v.draft.dateDs = parsed.date.ds; v.draft.dateLabel = parsed.date.label; v.draft.slotId=null; v.draft.slotLabel=null; }
  if(parsed.slot){ v.draft.slotId = parsed.slot.id; v.draft.slotLabel = parsed.slot.start+' - '+parsed.slot.end; }
  v.needText = parsed.timeAmbiguous
    ? 'There\'s more than one slot around that time — please say the exact time (e.g. "10 AM") or choose from the list.'
    : null;

  const complete = !!(v.draft.centreId && v.draft.cropId && v.draft.dateDs && v.draft.slotId);

  if(parsed.intent==='CONFIRM_BOOKING' && v.awaitingConfirm && complete){
    applyVoiceDraftToWizard();
    closeVoiceModal();
    createBooking();
    return;
  }
  v.awaitingConfirm = complete;
  render();
}

function renderVoicePanelBody(){
  const v = state.voice;
  const supported = (typeof KSVoiceRecognition !== 'undefined') && KSVoiceRecognition.isSupported();
  const d = v.draft;

  let html = '<div class="flex-between mb14"><b style="font-size:16px">🎙️ Voice Booking</b><span class="link" data-action="modal-close">✕</span></div>';

  if(!supported){
    html += '<div class="card" style="border-color:var(--red)"><b>Voice booking isn\'t supported in this browser.</b>'+
      '<p class="small mt10">Try Chrome on Android or desktop, or continue with manual booking below.</p></div>'+
      '<button class="btn btn-primary btn-block mt14" data-action="voice-manual">Continue Manually</button>';
    return html;
  }

  html += '<div class="flex-between mb14" style="gap:10px;flex-wrap:wrap">'+
    '<label class="small">Language: <select class="input" style="width:auto" data-action="voice-lang">'+
      '<option value="en-IN"'+(v.lang==='en-IN'?' selected':'')+'>English</option>'+
      '<option value="bn-IN"'+(v.lang==='bn-IN'?' selected':'')+'>বাংলা</option>'+
    '</select></label>'+
  '</div>';

  html += '<div class="center mb14">'+
    (v.listening
      ? '<button class="btn btn-danger btn-block" data-action="voice-stop">⏹ Stop Listening</button>'
      : '<button class="btn btn-gold btn-block" data-action="voice-start">🎤 '+(v.transcript?'Listen Again':'Start Listening')+'</button>')+
  '</div>';

  html += '<div class="card" style="min-height:44px">'+
    (v.listening
      ? '<span class="small mic-pulse" style="color:var(--green)"><b>● Listening…</b></span>'+(v.interim?'<div class="mt10">"'+esc(v.interim)+'"</div>':'')
      : (v.transcript ? '<div class="small">You said:</div><div class="mt10">"'+esc(v.transcript)+'"</div>' : '<span class="small">Tap the mic and speak, e.g. "Book paddy tomorrow at 10 AM."</span>'))+
  '</div>';

  if(v.error) html += '<div class="card mt10" style="border-color:var(--red);color:var(--red)">'+esc(v.error)+'</div>';
  if(v.needText) html += '<div class="card mt10" style="border-color:var(--wheat-deep)">'+esc(v.needText)+'</div>';

  const anyField = d.cropId || d.centreId || d.dateDs || d.slotId;
  if(anyField){
    html += '<div class="card mt10">'+
      '<b class="small">What I understood:</b>'+
      '<div class="grid grid-2 mt10">'+
        '<div><div class="small">Crop</div><b>'+(d.cropName?esc(d.cropName):'—')+'</b></div>'+
        '<div><div class="small">Centre</div><b>'+(d.centreName?esc(d.centreName):'—')+'</b></div>'+
        '<div><div class="small">Date</div><b>'+(d.dateLabel?esc(d.dateLabel):'—')+'</b></div>'+
        '<div><div class="small">Time</div><b>'+(d.slotLabel?esc(d.slotLabel):'—')+'</b></div>'+
      '</div>'+
    '</div>';
  }

  if(v.awaitingConfirm){
    html += '<div class="card mt10" style="border-color:var(--green)"><b>Please Confirm</b>'+
      '<p class="small mt10">Do you want to confirm this booking? Say "Confirm" or "Yes", or tap Confirm below.</p>'+
      '<button class="btn btn-primary btn-block mt10" data-action="voice-confirm">✅ Confirm Booking</button>'+
      '<button class="btn btn-outline btn-block mt10" data-action="voice-edit">✏️ Edit</button>'+
    '</div>';
  } else if(anyField){
    html += '<button class="btn btn-outline btn-block mt10" data-action="voice-manual">Continue Manually from Here</button>';
  }

  html += '<div class="center small mt14"><span class="link" data-action="voice-cancel-draft">Start over</span></div>';
  return html;
}

async function createBooking(){
  const w = state.bookingWizard;
  if(!w.centreId || !w.cropId || !w.slotId){ toast('Please complete all steps','err'); return; }
  if(w.submitting) return; // ignore double-clicks/double-taps while a request is already in flight
  // One idempotency key per booking ATTEMPT — generated once and reused on
  // every retry of this same attempt (double-click, dropped response,
  // mobile network retry), so a retry can never create a second booking.
  // A fresh key is only ever minted once the wizard actually resets (see
  // the success path below and the wizard-nav selection handlers).
  if(!w.idemKey) w.idemKey = (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random()));
  w.submitting = true; render();
  try{
    const result = await apiFetch('/bookings', {
      method:'POST',
      headers: { 'Idempotency-Key': w.idemKey },
      body: JSON.stringify({ centreId:w.centreId, cropId:w.cropId, slotId:w.slotId })
    });
    toast('Booking confirmed', 'ok');
    state.bookingWizard = { step:1, district:DISTRICT, centreId:null, cropId:null, date:null, slotId:null, idemKey:null, submitting:false };
    state.lastBookingId = result.bookingId;
    await loadState();
    navigate('farmer/confirm');
  }catch(err){
    w.submitting = false;
    // The backend is authoritative on availability — our local slot list
    // may be stale. On a conflict (slot just filled up, or a duplicate
    // active booking), refresh from the server and drop back to the
    // slot-selection step rather than resetting the whole wizard.
    const msg = (err && err.message) || '';
    if(/filled up|already have an active booking|conflicting request/i.test(msg)){
      w.slotId = null;
      w.step = 4;
      w.idemKey = null; // that attempt is over — a fresh pick gets a fresh key
      await loadState().catch(()=>{});
    }
    render();
  }
}

async function markAllNotificationsRead(){
  try{
    await apiFetch('/notifications/mark-all-read', {method:'POST'});
    await loadState();
    render();
  }catch(err){ /* toast already shown */ }
}

/* ---------------- live updates over Socket.IO ---------------- */
// Replaces the old client-only setInterval simulation: the server now runs
// the "other centres are moving too" engine and broadcasts a
// 'state:changed' event whenever anything changes (a booking, a call, a
// procurement, a payment settling, or the background simulation ticking).
// Every connected browser — farmer, operator, admin, or the public TV
// display — refreshes from MongoDB and re-renders when it hears this.
const socket = (typeof io==='function') ? io({ auth: { token: getStoredToken() } }) : null;
// Socket.IO connects once at page load — before a farmer/operator/admin
// has necessarily logged in — and the server decides which room to put
// this socket in (see server.js) purely from the auth token it was given
// at connect time. So on login/logout the token changes but the existing
// socket connection wouldn't otherwise know that; reconnecting with the
// fresh token is what actually moves it into (or out of) the right room.
function resyncSocketAuth(){
  if(!socket) return;
  socket.auth = { token: getStoredToken() };
  socket.disconnect().connect();
}
if(socket){
  socket.on('state:changed', async ()=>{
    if(!state.authed && state.route!=='tv') return;
    try{ await loadState(); }catch(e){ return; }
    if(state.modal && state.modal.type==='scan') return; // don't tear down the live camera mid-scan
    if(state.route.startsWith('farmer/') || state.route.startsWith('operator/') || state.route.startsWith('admin/') || state.route==='tv'){
      render();
    }
  });
}

/* ---------------- nav config ---------------- */
function navFarmer(){ return [
  ['farmer/dashboard','🏠',t('nav_dashboard')], ['farmer/book','📅',t('nav_book')], ['farmer/queue','📍',t('nav_queue')],
  ['farmer/payments','💰',t('nav_payments')], ['farmer/history','📜',t('nav_history')],
  ['farmer/notifications','🔔',t('nav_notifications')], ['farmer/profile','👤',t('nav_profile')] ]; }
function navOperator(){ return [
  ['operator/dashboard','📋',t('nav_dashboard')], ['operator/crops','🌾',t('nav_crops')], ['operator/payments','💰',t('nav_payments')],
  ['operator/reports','📊',t('nav_reports')], ['operator/notifications','🔔',t('nav_notifications')] ]; }
function navAdmin(){ return [
  ['admin/dashboard','📊',t('nav_dashboard')], ['admin/farmers','🧑‍🌾',t('nav_farmers')], ['admin/centres','🏢',t('nav_centres')],
  ['admin/operators','👷',t('nav_operators')],
  ['admin/bookings','🎟',t('nav_bookings')], ['admin/queues','📍',t('nav_queues')], ['admin/payments','💰',t('nav_payments')],
  ['admin/analytics','📈',t('nav_analytics')], ['admin/settings','⚙️',t('nav_settings')] ]; }
function navSuperAdmin(){ return [
  ['superadmin/admins','🛡️',t('nav_admins')] ]; }

/* ---------------- badges ---------------- */
function queueBadge(status){
  const map = { waiting:['badge-waiting','Waiting'], called:['badge-called','Called'], 'in-procurement':['badge-progress','In Procurement'],
    completed:['badge-done','Completed'], failed:['badge-absent','Payment Failed'], absent:['badge-absent','Absent'], cancelled:['badge-cancel','Cancelled'], booked:['badge-booked','Booked'] };
  const m = map[status] || ['badge-booked', status];
  return '<span class="badge '+m[0]+'">'+m[1]+'</span>';
}
function payBadge(status){
  const map = { Pending:['badge-waiting','Pending'], Processing:['badge-progress','Processing'], Completed:['badge-done','Completed'], Failed:['badge-absent','Failed'] };
  const m = map[status] || ['badge-booked', status];
  return '<span class="badge '+m[0]+'">'+m[1]+'</span>';
}
function slotStatusLabel(slot){
  const ratio = slot.availableSlots/slot.capacity;
  if(slot.availableSlots<=0) return {label:'Full', cls:'badge-absent'};
  if(ratio<=0.35) return {label:'Limited', cls:'badge-waiting'};
  return {label:'Available', cls:'badge-done'};
}

/* ---------------- app navigation ---------------- */
function navigate(route){
  state.route = route;
  window.scrollTo(0,0);
  if(route.indexOf('login')===0 || route.indexOf('register')===0 || route==='setup-admin'){
    state.authForm = {}; state.authError = '';
  }
  if(route==='tv' && !state.db.centres.length){
    // Public display can be reached before login — fetch data on demand.
    loadState().then(render).catch(()=>{});
    render(); // show the shell immediately; it'll re-render once data arrives
    return;
  }
  render();
}
// Applies a successful login/registration/setup response ({token, user})
// to app state, loads live data, and routes into that role's home screen.
async function enterAsUser(user, token){
  setStoredToken(token);
  resyncSocketAuth();
  state.authed = true; state.role = user.role; state.userId = user.id;
  state.operatorCentreId = user.role==='operator' ? user.centreId : null;
  await loadState();
  state.route = user.role==='super-admin' ? 'superadmin/admins' : user.role+'/dashboard';
  state.authForm = {}; state.authError = '';
  render();
}
async function doLogin(role){
  state.authError = '';
  const f = state.authForm;
  try{
    const { token, user } = await apiFetch('/auth/login', {
      method:'POST', body: JSON.stringify({ role, mobile:f.mobile, password:f.password })
    });
    await enterAsUser(user, token);
  }catch(err){ state.authError = err.message; render(); }
}
async function doFarmerRegister(){
  state.authError = '';
  const f = state.authForm;
  try{
    const { token, user } = await apiFetch('/auth/register/farmer', {
      method:'POST', body: JSON.stringify(f)
    });
    await enterAsUser(user, token);
  }catch(err){ state.authError = err.message; render(); }
}
async function doSuperAdminSetup(){
  state.authError = '';
  const f = state.authForm;
  try{
    const { token, user } = await apiFetch('/auth/setup-super-admin', {
      method:'POST', body: JSON.stringify(f)
    });
    state.setupNeeded = false;
    await enterAsUser(user, token);
  }catch(err){ state.authError = err.message; render(); }
}
function logout(){
  setStoredToken(null);
  resyncSocketAuth();
  state.authed=false; state.role=null; state.userId=null; state.route='landing'; state.db=EMPTY_DB;
  state.authForm={}; state.authError='';
  state.admins=[]; state.operators=[]; state.adminsLoaded=false; state.operatorsLoaded=false; state.search='';
  render();
}

/* ---------------- Super Admin: manage normal admins ---------------- */
async function loadAdmins(q){
  try{
    const { admins } = await apiFetch('/users/admins'+(q?'?q='+encodeURIComponent(q):''));
    state.admins = admins; state.adminsLoaded = true;
  }catch(err){ /* toast already shown */ }
}
function openAdminForm(admin){
  state.showAdminForm = true; state.adminFormError = '';
  state.editingAdminId = admin ? admin.id : null;
  state.adminForm = admin ? { name:admin.name, mobile:admin.mobile, email:admin.email||'', password:'' } : {};
}
function closeAdminForm(){ state.showAdminForm = false; state.editingAdminId = null; state.adminForm = {}; state.adminFormError=''; render(); }
async function submitAdminForm(){
  const f = state.adminForm;
  try{
    if(state.editingAdminId){
      await apiFetch('/users/admins/'+state.editingAdminId, { method:'PUT', body: JSON.stringify(f) });
      toast('Admin updated.','ok');
    } else {
      await apiFetch('/users/admins', { method:'POST', body: JSON.stringify(f) });
      toast('Admin created.','ok');
    }
    closeAdminForm();
    await loadAdmins(state.search);
    render();
  }catch(err){ state.adminFormError = err.message; render(); }
}
async function toggleAdminStatus(admin){
  const status = admin.status==='active' ? 'suspended' : 'active';
  try{ await apiFetch('/users/admins/'+admin.id, { method:'PUT', body: JSON.stringify({status}) }); await loadAdmins(state.search); render(); }catch(err){}
}
async function deleteAdmin(id){
  try{ await apiFetch('/users/admins/'+id, { method:'DELETE' }); toast('Admin removed.','ok'); await loadAdmins(state.search); render(); }catch(err){}
}

/* ---------------- Admin: manage operators ---------------- */
async function loadOperators(q){
  try{
    const { operators } = await apiFetch('/users/operators'+(q?'?q='+encodeURIComponent(q):''));
    state.operators = operators; state.operatorsLoaded = true;
  }catch(err){ /* toast already shown */ }
}
function openOperatorForm(op){
  state.showOperatorForm = true; state.operatorFormError = '';
  state.editingOperatorId = op ? op.id : null;
  state.operatorForm = op ? { name:op.name, mobile:op.mobile, email:op.email||'', centreId:op.centreId, password:'' } : { centreId: state.db.centres[0] && state.db.centres[0].id };
}
function closeOperatorForm(){ state.showOperatorForm = false; state.editingOperatorId = null; state.operatorForm = {}; state.operatorFormError=''; render(); }
async function submitOperatorForm(){
  const f = state.operatorForm;
  try{
    if(state.editingOperatorId){
      await apiFetch('/users/operators/'+state.editingOperatorId, { method:'PUT', body: JSON.stringify(f) });
      toast('Operator updated.','ok');
    } else {
      await apiFetch('/users/operators', { method:'POST', body: JSON.stringify(f) });
      toast('Operator created.','ok');
    }
    closeOperatorForm();
    await loadOperators(state.search);
    render();
  }catch(err){ state.operatorFormError = err.message; render(); }
}
async function toggleOperatorStatus(op){
  const status = op.status==='active' ? 'suspended' : 'active';
  try{ await apiFetch('/users/operators/'+op.id, { method:'PUT', body: JSON.stringify({status}) }); await loadOperators(state.search); render(); }catch(err){}
}
async function deleteOperator(id){
  try{ await apiFetch('/users/operators/'+id, { method:'DELETE' }); toast('Operator removed.','ok'); await loadOperators(state.search); render(); }catch(err){}
}

/* ---------------- Admin: manage procurement centres ---------------- */
function openCentreForm(centre){
  state.showCentreForm = true; state.centreFormError = '';
  state.editingCentreId = centre ? centre.id : null;
  state.centreForm = centre ? {
    name:centre.name, village:centre.village, district:centre.district, state:centre.state,
    capacityPerHour:centre.capacityPerHour, openTime:centre.openTime, closeTime:centre.closeTime,
    distance:centre.distance, tokenPrefix:centre.tokenPrefix, cropIds:(centre.cropIds||[]).slice(),
  } : { district:DISTRICT, state:'West Bengal', openTime:'09:00', closeTime:'17:00', cropIds:[] };
}
function closeCentreForm(){ state.showCentreForm = false; state.editingCentreId = null; state.centreForm = {}; state.centreFormError=''; render(); }
function toggleCentreFormCrop(cropId){
  const f = state.centreForm;
  f.cropIds = f.cropIds || [];
  const i = f.cropIds.indexOf(cropId);
  if(i===-1) f.cropIds.push(cropId); else f.cropIds.splice(i,1);
  render();
}
async function submitCentreForm(){
  const f = state.centreForm;
  if(!(f.cropIds||[]).length){ state.centreFormError = 'Select at least one crop this centre will procure.'; render(); return; }
  try{
    if(state.editingCentreId){
      await apiFetch('/centres/'+state.editingCentreId, { method:'PUT', body: JSON.stringify(f) });
      toast('Centre updated.','ok');
    } else {
      await apiFetch('/centres', { method:'POST', body: JSON.stringify(f) });
      toast('Centre created.','ok');
    }
    closeCentreForm();
    await loadState();
    render();
  }catch(err){ state.centreFormError = err.message; render(); }
}
async function deleteCentre(id){
  try{ await apiFetch('/centres/'+id, { method:'DELETE' }); toast('Centre removed.','ok'); await loadState(); render(); }catch(err){}
}

/* ---------------- Operator (or Admin): manage a centre's crop-seed catalog ---------------- */
function openCropForm(crop){
  state.showCropForm = true; state.cropFormError = '';
  state.editingCropId = crop ? crop.id : null;
  state.cropForm = crop ? { name:crop.name, unit:crop.unit, rate:crop.rate } : { unit:'kg' };
}
function closeCropForm(){ state.showCropForm = false; state.editingCropId = null; state.cropForm = {}; state.cropFormError=''; render(); }
async function submitCropForm(centreId){
  const f = state.cropForm;
  try{
    if(state.editingCropId){
      await apiFetch('/centres/'+centreId+'/crops/'+state.editingCropId, { method:'PUT', body: JSON.stringify(f) });
      toast('Crop updated.','ok');
    } else {
      await apiFetch('/centres/'+centreId+'/crops', { method:'POST', body: JSON.stringify(f) });
      toast('Crop added.','ok');
    }
    closeCropForm();
    await loadState();
    render();
  }catch(err){ state.cropFormError = err.message; render(); }
}
async function deleteCropFromCentre(centreId, cropId){
  try{
    await apiFetch('/centres/'+centreId+'/crops/'+cropId, { method:'DELETE' });
    toast('Crop removed from catalog.','ok');
    await loadState();
    render();
  }catch(err){ /* toast already shown */ }
}

/* ---------------- Farmer: edit own profile ---------------- */
function openProfileForm(){
  const f = currentFarmer();
  state.showProfileForm = true; state.profileFormError = '';
  state.profileForm = { name:f.name, email:f.email||'', village:f.village, district:f.district, state:f.state, mainCrop:f.mainCrop, landAcres:f.landAcres };
}
function closeProfileForm(){ state.showProfileForm = false; state.profileForm = {}; state.profileFormError=''; render(); }
async function submitProfileForm(){
  try{
    await apiFetch('/auth/me', { method:'PUT', body: JSON.stringify(state.profileForm) });
    toast('Profile updated.','ok');
    closeProfileForm();
    await loadState();
    render();
  }catch(err){ state.profileFormError = err.message; render(); }
}

/* ---------------- shared shell ---------------- */
function renderTopbar(){
  const langSel = '<select class="lang-select" data-action="set-lang">'+
    ['en','hi','bn'].map(l=>'<option value="'+l+'"'+(state.lang===l?' selected':'')+'>'+({en:'English',hi:'हिन्दी',bn:'বাংলা'}[l])+'</option>').join('')+
    '</select>';
  const rightAuthed = state.authed ? '<button class="pill-btn" data-action="logout">Logout</button>'
    : '<button class="pill-btn" data-action="nav" data-route="login">Login</button>';
  return '<div class="topbar">'+
    '<div class="brand" style="cursor:pointer" data-action="nav" data-route="'+(state.authed?state.route:'landing')+'">'+
      '<div class="mark">KS</div><div><div>'+t('app')+'</div><small>'+t('tagline')+'</small></div>'+
    '</div>'+
    '<div class="topbar-right">'+langSel+rightAuthed+'</div>'+
  '</div>';
}
function renderSidebar(){
  const items = state.role==='farmer'?navFarmer(): state.role==='operator'?navOperator(): state.role==='super-admin'?navSuperAdmin(): navAdmin();
  const centre = state.role==='operator' ? centreById(state.operatorCentreId) : null;
  const name = state.role==='farmer' ? currentFarmer().name
    : state.role==='operator' ? 'Operator — '+(centre?centre.name.replace(' Procurement Centre',''):'—')
    : state.role==='super-admin' ? 'Super Administrator'
    : 'System Administrator';
  return '<div class="sidebar">'+
    '<div class="side-user"><div class="name">'+esc(name)+'</div><div class="role">'+state.role+'</div></div>'+
    items.map(([r,ic,label])=>'<div class="navlink'+(state.route===r?' active':'')+'" data-action="nav" data-route="'+r+'"><span class="ico">'+ic+'</span>'+label+'</div>').join('')+
  '</div>';
}

/* ---------------- LANDING ---------------- */
function renderLanding(){
  return ''+
  '<div class="landing-nav">'+
    '<div class="brand" style="color:var(--green-deep)"><div class="mark">KS</div><div><div>'+t('app')+'</div><small style="color:var(--ink-faint)">'+t('tagline')+'</small></div></div>'+
    '<div class="flex gap10">'+ '<select class="lang-select" style="background:#fff;color:var(--ink);border-color:var(--line)" data-action="set-lang">'+
      ['en','hi','bn'].map(l=>'<option value="'+l+'"'+(state.lang===l?' selected':'')+'>'+({en:'English',hi:'हिन्दी',bn:'বাংলা'}[l])+'</option>').join('')+'</select>'+
      '<button class="btn btn-primary" data-action="nav" data-route="login">Login</button></div>'+
  '</div>'+
  '<div class="landing-hero">'+
    '<h1>Smart Procurement.<br>Less Waiting. Better Service.</h1>'+
    '<p>Book your procurement slot, track your queue in real time, and know your procurement and payment status — from anywhere. A digital service by the Department of Consumer Affairs.</p>'+
    '<div class="cta-row">'+
      '<button class="btn btn-gold" data-action="nav" data-route="register/farmer">Register as Farmer</button>'+
      '<button class="btn btn-outline" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.5)" data-action="nav" data-route="login/farmer">Book a Slot</button>'+
      '<button class="btn btn-outline" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.5)" data-action="nav" data-route="tv">View Live Queue Display</button>'+
    '</div>'+
  '</div>'+
  '<div class="landing-section">'+
    '<div class="eyebrow">How it works</div><div class="h2" style="margin-bottom:18px">Six steps from field to payment</div>'+
    '<div class="step-cards">'+
      [['1','🧾','Register'],['2','📅','Book Slot'],['3','🎟','Receive Token'],['4','📍','Track Queue'],['5','🌾','Complete Procurement'],['6','💰','Track Payment']]
      .map(([n,ic,tl])=>'<div class="step-card"><div class="n">STEP '+n+'</div><div class="ic">'+ic+'</div><div class="t">'+tl+'</div></div>').join('')+
    '</div>'+
  '</div>'+
  '<div class="landing-section tint">'+
    '<div class="eyebrow">Benefits</div><div class="h2" style="margin-bottom:18px">Built for how farmers actually use their phones</div>'+
    '<div class="feature-grid">'+
      [['⏱️','Real-time queue','See your exact position and estimated wait, updating automatically — no refreshing, no guessing.'],
       ['🎟','Digital token','A QR-coded token replaces paperwork. Show it at the centre, or let the operator scan it.'],
       ['🔔','Instant alerts','Get notified when your slot is booked, your turn is approaching, and your payment clears.'],
       ['💰','Payment tracking','Follow your procurement from gross amount to final payout, with a full transaction history.'],
       ['📍','Nearby centres','Compare distance, live queue length and available slots before you choose where to go.'],
       ['🌐','Your language','Available in English, Hindi and Bengali, with a simple, large-text interface.']]
      .map(([ic,tl,ds])=>'<div class="feature"><div class="ic">'+ic+'</div><h3>'+tl+'</h3><p>'+ds+'</p></div>').join('')+
    '</div>'+
  '</div>'+
  '<div class="landing-section">'+
    '<div class="eyebrow">FAQ</div><div class="h2" style="margin-bottom:18px">Common questions</div>'+
    '<div class="grid grid-2">'+
      [['Do I need to bring documents?','Bring your Farmer ID and land record on your first visit. After that, your digital token covers verification.'],
       ['What happens if I miss my slot?','Slots have a grace window set by the centre. After that your token is marked absent and you can rebook.'],
       ['How do I know my payment cleared?','You get a notification the moment payment is processed, and it always appears in your Payments and History pages.'],
       ['Can I change my procurement centre?','Yes — cancel your current booking before check-in and book again at any centre with open capacity.']]
      .map(([q,a])=>'<div class="card"><b style="font-size:13.5px">'+q+'</b><p class="small mt10" style="line-height:1.5">'+a+'</p></div>').join('')+
    '</div>'+
  '</div>'+
  '<div class="landing-footer">'+
    '<div>Ministry of Consumer Affairs, Food &amp; Public Distribution — Department of Consumer Affairs</div>'+
    '<div>KisanSetu · Smart Automation Initiative · Demo Build</div>'+
  '</div>';
}

/* ---------------- LOGIN ---------------- */
function renderLogin(){
  const cards = [
    {role:'farmer', ic:'🧑‍🌾', title:'Farmer Portal', desc:'Book procurement slots, track your live queue position, and follow payments.'},
    {role:'operator', ic:'🏢', title:'Operator Portal', desc:'Run your centre\'s live queue — call farmers, record procurement, and manage payments.'},
    {role:'admin', ic:'🛡️', title:'Administrator Portal', desc:'Manage centres and operators, and view system-wide analytics across every procurement centre.'},
  ];
  return '<div class="login-wrap"><div class="login-card">'+
    '<div class="flex-between mb14"><div class="brand" style="color:var(--green-deep)"><div class="mark">KS</div><div>'+t('app')+'</div></div></div>'+
    '<div class="h2">Sign in to continue</div>'+
    '<p class="sub">Choose which portal you want to sign in to.</p>'+
    cards.map(c=>'<div class="card mb14" style="display:flex;gap:12px;align-items:flex-start">'+
      '<div style="font-size:26px">'+c.ic+'</div>'+
      '<div style="flex:1"><b style="font-size:14px">'+c.title+'</b><p class="small mt10" style="line-height:1.5;margin-bottom:10px">'+c.desc+'</p>'+
      '<button class="btn btn-primary btn-sm" data-action="nav" data-route="login/'+c.role+'">Sign in</button>'+
      (c.role==='farmer' ? ' <button class="btn btn-outline btn-sm" data-action="nav" data-route="register/farmer">New farmer? Register</button>' : '')+
      '</div></div>').join('')+
    (state.setupNeeded ? '<div class="card mb14" style="border-color:var(--gold,#B9791F)"><b style="font-size:13px">First time setting up KisanSetu?</b>'+
      '<p class="small mt10" style="line-height:1.5">No Super Admin account exists yet. Set one up once to start creating regular admins.</p>'+
      '<button class="btn btn-gold btn-sm mt10" data-action="nav" data-route="setup-admin">Set up Super Admin</button></div>' : '')+
    '<div class="center small mt14"><span class="link" data-action="nav" data-route="landing">← Back to home</span></div>'+
  '</div></div>';
}

const PORTAL_META = {
  farmer:{ic:'🧑‍🌾', title:'Farmer Portal'},
  operator:{ic:'🏢', title:'Operator Portal'},
  admin:{ic:'🛡️', title:'Administrator Portal'},
};
function passwordToggleHtml(id){
  return '<button type="button" data-action="toggle-pw" data-target="'+id+'" '+
    'style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:15px;padding:2px;line-height:1" '+
    'aria-label="Show or hide password">👁</button>';
}
function authField(label, name, opts){
  opts = opts||{};
  const type = opts.type||'text';
  const val = esc(state.authForm[name]||'');
  if(type==='password'){
    const id = 'auth-pw-'+name;
    return '<div class="field"><label>'+label+'</label><div style="position:relative">'+
      '<input type="password" id="'+id+'" style="padding-right:36px;width:100%;box-sizing:border-box" value="'+val+'" data-action="auth-field" data-field="'+name+'"'+(opts.placeholder?' placeholder="'+opts.placeholder+'"':'')+'>'+
      passwordToggleHtml(id)+
    '</div></div>';
  }
  return '<div class="field"><label>'+label+'</label><input type="'+type+'" value="'+val+'" data-action="auth-field" data-field="'+name+'"'+(opts.placeholder?' placeholder="'+opts.placeholder+'"':'')+'></div>';
}
function renderLoginForm(role){
  const meta = PORTAL_META[role] || PORTAL_META.admin;
  return '<div class="login-wrap"><div class="login-card">'+
    '<div class="flex-between mb14"><div class="brand" style="color:var(--green-deep)"><div class="mark">KS</div><div>'+t('app')+'</div></div></div>'+
    '<div class="h2">'+meta.ic+' '+meta.title+'</div>'+
    '<p class="sub">Sign in with your mobile number and password.</p>'+
    (state.authError ? '<div class="card mb14" style="border-color:#B23A2E;color:#B23A2E;font-size:13px">'+esc(state.authError)+'</div>' : '')+
    '<form data-action="auth-submit" data-form="login" data-role="'+role+'">'+
      authField('Mobile number','mobile',{type:'tel', placeholder:'10-digit mobile number'})+
      authField('Password','password',{type:'password'})+
      '<button class="btn btn-primary btn-block mt10" type="submit">Sign in</button>'+
    '</form>'+
    (role==='farmer' ? '<div class="center small mt14">New here? <span class="link" data-action="nav" data-route="register/farmer">Register as a farmer</span></div>' : '')+
    '<div class="center small mt14"><span class="link" data-action="nav" data-route="login">← Choose a different portal</span></div>'+
  '</div></div>';
}

/* ---------------- FARMER SELF-REGISTRATION ---------------- */
function renderFarmerRegister(){
  return '<div class="login-wrap"><div class="login-card" style="max-width:480px">'+
    '<div class="flex-between mb14"><div class="brand" style="color:var(--green-deep)"><div class="mark">KS</div><div>'+t('app')+'</div></div></div>'+
    '<div class="h2">🧑‍🌾 Farmer Registration</div>'+
    '<p class="sub">Farmers can only sign up here — operator and admin accounts are created for you by KisanSetu staff.</p>'+
    (state.authError ? '<div class="card mb14" style="border-color:#B23A2E;color:#B23A2E;font-size:13px">'+esc(state.authError)+'</div>' : '')+
    '<form data-action="auth-submit" data-form="register-farmer">'+
      authField('Full name','name')+
      authField('Mobile number','mobile',{type:'tel', placeholder:'10-digit mobile number'})+
      authField('Email (optional)','email',{type:'email', placeholder:'you@example.com'})+
      authField('Password','password',{type:'password', placeholder:'At least 6 characters'})+
      '<div class="grid grid-2">'+authField('Village','village')+authField('District','district')+'</div>'+
      '<div class="grid grid-2">'+authField('State','state')+authField('Main crop','mainCrop')+'</div>'+
      authField('Land (acres)','landAcres')+
      '<button class="btn btn-primary btn-block mt10" type="submit">Create my account</button>'+
    '</form>'+
    '<div class="center small mt14">Already registered? <span class="link" data-action="nav" data-route="login/farmer">Sign in</span></div>'+
    '<div class="center small mt10"><span class="link" data-action="nav" data-route="login">← Choose a different portal</span></div>'+
  '</div></div>';
}

/* ---------------- ONE-TIME SUPER ADMIN SETUP ---------------- */
function renderSuperAdminSetup(){
  if(state.setupNeeded===false){
    return '<div class="login-wrap"><div class="login-card">'+
      '<div class="h2">Setup already complete</div>'+
      '<p class="sub">A Super Admin account already exists, so this one-time setup screen is closed.</p>'+
      '<button class="btn btn-primary btn-block mt10" data-action="nav" data-route="login/admin">Go to Administrator sign in</button>'+
    '</div></div>';
  }
  return '<div class="login-wrap"><div class="login-card">'+
    '<div class="flex-between mb14"><div class="brand" style="color:var(--green-deep)"><div class="mark">KS</div><div>'+t('app')+'</div></div></div>'+
    '<div class="h2">🛡️ Set up Super Admin</div>'+
    '<p class="sub">This one-time screen only works while no Super Admin account exists yet. The Super Admin will be able to create and manage regular admin accounts.</p>'+
    (state.authError ? '<div class="card mb14" style="border-color:#B23A2E;color:#B23A2E;font-size:13px">'+esc(state.authError)+'</div>' : '')+
    '<form data-action="auth-submit" data-form="setup-admin">'+
      authField('Full name','name')+
      authField('Mobile number','mobile',{type:'tel', placeholder:'10-digit mobile number'})+
      authField('Email (optional)','email',{type:'email', placeholder:'you@example.com'})+
      authField('Password','password',{type:'password', placeholder:'At least 6 characters'})+
      '<button class="btn btn-gold btn-block mt10" type="submit">Create Super Admin account</button>'+
    '</form>'+
    '<div class="center small mt14"><span class="link" data-action="nav" data-route="login">← Back to sign in</span></div>'+
  '</div></div>';
}

/* ---------------- FARMER: dashboard ---------------- */
function farmerActiveBooking(){
  const f = currentFarmer();
  const bookings = state.db.bookings.filter(b=> b.farmerId===f.id && ['waiting','called','in-procurement'].includes(state.db.queue[b.id]?.status));
  return bookings[0] || null;
}
function renderFarmerDashboard(){
  const f = currentFarmer();
  const booking = farmerActiveBooking();
  let statusCard;
  if(booking){
    const centre = centreById(booking.centreId);
    const q = state.db.queue[booking.id];
    const info = queuePositionInfo(centre, booking.id);
    statusCard = '<div class="card" style="border-color:var(--wheat)">'+
      '<div class="flex-between mb10"><div class="h2" style="margin:0">Today\'s Status</div>'+queueBadge(q.status)+'</div>'+
      '<div class="grid grid-3">'+
        '<div><div class="small">Procurement Centre</div><b>'+centre.name+'</b></div>'+
        '<div><div class="small">Appointment</div><b>'+fmtDate(new Date(booking.bookingDate))+' · '+booking.time+'</b></div>'+
        '<div><div class="small">Token Number</div><b class="mono" style="color:var(--wheat-deep);font-size:16px">'+booking.tokenNumber+'</b></div>'+
      '</div>'+
      '<div class="divider"></div>'+
      '<div class="grid grid-3">'+
        '<div class="stat"><div class="label">'+t('now_serving')+'</div><div class="value">'+(nowServingToken(centre)||'—')+'</div></div>'+
        '<div class="stat"><div class="label">'+t('people_ahead')+'</div><div class="value">'+(info?info.peopleAhead:0)+'</div></div>'+
        '<div class="stat"><div class="label">'+t('est_wait')+'</div><div class="value">'+(info?info.estWait:0)+' min</div></div>'+
      '</div>'+
      '<button class="btn btn-primary mt14" data-action="nav" data-route="farmer/queue">📍 Track Live Queue</button>'+
    '</div>';
  } else {
    statusCard = '<div class="card empty"><div class="big">🌾</div><b>No active booking right now</b>'+
      '<p class="small mt10">Book a procurement slot to get your token and join the live queue.</p>'+
      '<button class="btn btn-primary mt14" data-action="nav" data-route="farmer/book">📅 Book a Slot</button></div>';
  }
  const quick = [['📅','Book Slot','farmer/book'],['🎟','My Token','farmer/queue'],['📍','Track Queue','farmer/queue'],
    ['🌾','Procurement Status','farmer/history'],['💰','Payment Status','farmer/payments'],['🔔','Notifications','farmer/notifications'],['📜','History','farmer/history']];
  const unread = state.db.notifications.filter(n=>n.userId===f.id && !n.read).length;
  return '<div class="h1">'+t('welcome')+', '+esc(f.name.split(' ')[0])+' 👋</div>'+
    '<p class="sub">Farmer ID '+f.farmerId+' · '+f.village+', '+f.district+(unread?' · <b style="color:var(--wheat-deep)">'+unread+' new notification'+(unread>1?'s':'')+'</b>':'')+'</p>'+
    statusCard+
    '<div class="h2 mt22">Quick Actions</div>'+
    '<div class="qa-grid">'+quick.map(([ic,l,r])=>'<button class="qa-btn" data-action="nav" data-route="'+r+'"><span class="ic">'+ic+'</span>'+l+'</button>').join('')+
      '<button class="qa-btn" data-action="voice-open"><span class="ic">🎙️</span>Voice Booking</button>'+
    '</div>';
}

/* ---------------- FARMER: book slot wizard ---------------- */
function recommendedCentres(){
  return state.db.centres.map(c=>{
    const qlen = activeQueueList(c).length;
    const todaySlots = state.db.slots.filter(s=>s.centreId===c.id && s.date===TODAY.toDateString());
    const avail = todaySlots.reduce((a,s)=>a+s.availableSlots,0);
    return { c, qlen, wait: qlen*c.avgProcessMin, avail };
  }).sort((a,b)=>a.c.distance-b.c.distance);
}
function renderFarmerBook(){
  const w = state.bookingWizard;
  const steps = ['Centre','Crop','Date','Time Slot','Confirm'];
  const stepperHTML = '<div class="stepper">'+steps.map((s,i)=>{
    const n=i+1; const cls = n<w.step?'done':n===w.step?'active':'';
    return '<div class="step '+cls+'"><div class="dot">'+(n<w.step?'✓':n)+'</div><div class="lbl">'+s+'</div></div>'+(i<steps.length-1?'<div class="step-line"></div>':'');
  }).join('')+'</div>';

  let body = '';
  if(w.step===1){
    const recs = recommendedCentres();
    body = '<div class="h2">Choose a procurement centre</div><p class="sub">District: '+w.district+'. Centres below are sorted by distance, with live queue and slot data.</p>'+
      recs.map(r=>{
        const overloaded = r.qlen > r.c.capacityPerHour*1.5;
        return '<div class="card mb14" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'+
          '<div><b style="font-size:14.5px">'+r.c.name+'</b>'+(overloaded?' <span class="badge badge-absent">Overloaded — try another centre</span>':'')+
          '<div class="small mt10">Distance: '+r.c.distance+' km · Queue: '+r.qlen+' farmers · Est. wait: '+r.wait+' min · Slots today: '+r.avail+' available</div></div>'+
          '<button class="btn btn-primary btn-sm" data-action="wizard-centre" data-id="'+r.c.id+'">Select</button>'+
        '</div>';
      }).join('');
  } else if(w.step===2){
    const centre = centreById(w.centreId);
    const crops = centreCropCatalog(centre);
    const activeCropIds = farmerActiveCropIdsAt(centre.id);
    body = '<div class="h2">What are you bringing? — '+centre.name+'</div><p class="sub">Only crops procured at this centre are shown.</p>'+
      '<div class="grid grid-2 mt14">'+crops.map(c=>{
        const sel = w.cropId===c.id;
        const blocked = activeCropIds.includes(c.id);
        return '<div class="card" style="'+(sel?'border-color:var(--green);background:var(--green-tint)':'')+(blocked?';opacity:.55':'')+'">'+
          '<div class="flex-between"><b>'+c.name+'</b><span class="small mono">'+fmtINR(c.rate)+'/'+c.unit+'</span></div>'+
          (blocked ? '<p class="small mt10">You already have an active booking for this crop at this centre.</p>' :
            '<button class="btn '+(sel?'btn-primary':'btn-outline')+' btn-sm mt10" data-action="wizard-crop" data-id="'+c.id+'">'+(sel?'Selected ✓':'Select')+'</button>')+
        '</div>';
      }).join('')+'</div>'+
      '<button class="btn btn-outline mt18" data-action="wizard-back">← Back</button>';
  } else if(w.step===3){
    const centre = centreById(w.centreId);
    const dates = [0,1,2,3,4].map(d=>addDays(TODAY,d));
    body = '<div class="h2">Choose a date — '+centre.name+'</div>'+
      '<div class="grid grid-4 mt14">'+dates.map(d=>{
        const sel = w.date===d.toDateString();
        return '<button class="qa-btn'+(sel?'':'')+'" style="'+(sel?'border-color:var(--green);background:var(--green-tint);color:var(--green-deep)':'')+'" data-action="wizard-date" data-date="'+d.toDateString()+'">'+
          '<span class="ic">📅</span>'+d.toLocaleDateString('en-IN',{weekday:'short'})+'<br>'+fmtDate(d)+'</button>';
      }).join('')+'</div>'+
      '<button class="btn btn-outline mt18" data-action="wizard-back">← Back</button>';
  } else if(w.step===4){
    const centre = centreById(w.centreId);
    const slots = state.db.slots.filter(s=>s.centreId===w.centreId && s.date===w.date);
    body = '<div class="h2">Choose a time slot — '+fmtDate(new Date(w.date))+'</div>'+
      '<table class="mt14"><thead><tr><th>Time</th><th>Available Slots</th><th>Status</th><th></th></tr></thead><tbody>'+
      slots.map(s=>{ const st = slotStatusLabel(s);
        return '<tr><td>'+s.start+' - '+s.end+'</td><td class="mono">'+s.availableSlots+' / '+s.capacity+'</td>'+
        '<td><span class="badge '+st.cls+'">'+st.label+'</span></td>'+
        '<td>'+(s.availableSlots>0?'<button class="btn btn-primary btn-sm" data-action="wizard-slot" data-id="'+s.id+'">Select</button>':'<button class="btn btn-outline btn-sm" disabled>Full</button>')+'</td></tr>';
      }).join('')+'</tbody></table>'+
      '<button class="btn btn-outline mt18" data-action="wizard-back">← Back</button>';
  } else if(w.step===5){
    const centre = centreById(w.centreId);
    const crop = cropById(w.cropId);
    const slot = state.db.slots.find(s=>s.id===w.slotId);
    body = '<div class="h2">Confirm your booking</div>'+
      '<div class="card">'+
        '<div class="grid grid-2">'+
          '<div><div class="small">Procurement Centre</div><b>'+centre.name+'</b></div>'+
          '<div><div class="small">District</div><b>'+centre.district+'</b></div>'+
          '<div><div class="small">Crop</div><b>'+crop.name+'</b></div>'+
          '<div><div class="small">Indicative Rate</div><b>'+fmtINR(crop.rate)+' / '+crop.unit+'</b></div>'+
          '<div><div class="small">Date</div><b>'+fmtDate(new Date(slot.date))+'</b></div>'+
          '<div><div class="small">Time</div><b>'+slot.start+' - '+slot.end+'</b></div>'+
        '</div>'+
      '</div>'+
      '<button class="btn btn-gold btn-block mt18" data-action="wizard-confirm"'+(w.submitting?' disabled':'')+'>'+(w.submitting?'Booking…':'✅ Confirm Booking')+'</button>'+
      '<button class="btn btn-outline btn-block mt10" data-action="wizard-back"'+(w.submitting?' disabled':'')+'>← Back</button>';
  }
  return '<div class="flex-between" style="flex-wrap:wrap;gap:8px"><div class="h1" style="margin:0">Book Procurement Slot</div>'+
    '<button class="btn btn-outline btn-sm" data-action="voice-open">🎙️ Voice Booking</button></div>'+
    stepperHTML+body;
}
// Crop ids for which this farmer already holds an active booking at the
// given centre — mirrors the server's one-active-booking-per-farmer+centre+crop
// rule so the picker can show it up front instead of only erroring on submit.
function farmerActiveCropIdsAt(centreId){
  const f = currentFarmer();
  if(!f) return [];
  const active = ['waiting','called','in-procurement'];
  return state.db.bookings
    .filter(b=>b.farmerId===f.id && b.centreId===centreId && active.includes((state.db.queue[b.id]||{}).status))
    .map(b=>b.cropId);
}
function renderFarmerConfirm(){
  const b = bookingById(state.lastBookingId);
  if(!b) return '<div class="empty">No recent booking.</div>';
  const centre = centreById(b.centreId);
  const crop = cropById(b.cropId);
  return '<div class="h1">Booking Confirmed ✅</div><p class="sub">Your QR token is ready — print it now or show it on your phone at the procurement centre.</p>'+
    '<div class="grid grid-2">'+
    '<div class="ticket">'+
      '<div class="top"><div class="stamp">Official Token</div>'+ticketQrHTML(b)+'</div>'+
      '<div class="token-num">'+b.tokenNumber+'</div>'+
      '<div class="meta">Booking ID '+b.id+'</div>'+
      '<div class="dashline"></div>'+
      '<div class="row"><span>Centre</span><b>'+centre.name+'</b></div>'+
      (crop ? '<div class="row"><span>Crop</span><b>'+crop.name+'</b></div>' : '')+
      '<div class="row"><span>Date</span><b>'+fmtDate(new Date(b.bookingDate))+'</b></div>'+
      '<div class="row"><span>Time</span><b>'+b.time+'</b></div>'+
      '<button class="btn btn-outline btn-sm mt14" data-action="print-qr" data-id="'+b.id+'">🖨️ Print QR token</button>'+
    '</div>'+
    '<div class="card">'+
      '<b>What happens next?</b>'+
      '<ul class="small" style="line-height:2;padding-left:18px">'+
        '<li>You\'ll get a reminder before your slot.</li>'+
        '<li>Bring this QR token — printed or on your phone.</li>'+
        '<li>Track your live position any time on <b>My Queue</b>.</li>'+
        '<li>The operator scans your QR to call you to the counter.</li>'+
      '</ul>'+
      '<button class="btn btn-primary btn-block mt10" data-action="nav" data-route="farmer/queue">📍 Track My Queue</button>'+
      '<button class="btn btn-outline btn-block mt10" data-action="nav" data-route="farmer/dashboard">Back to Dashboard</button>'+
    '</div></div>';
}
// Real, scannable QR code (via the qrcode-generator library loaded in
// index.html) for a booking's qrCode payload. The server fills that payload
// with the booking's real details right at booking time (see POST
// /api/bookings) and it never changes afterwards, so it's valid to show,
// print, and scan from the moment the slot is booked.
function svgQrTag(text, cellSize){
  if(typeof qrcode !== 'function'){
    // The qrcode-generator <script> (loaded from cdnjs in index.html) never
    // ran — usually a blocked/offline network. Nothing to do client-side
    // but fail visibly so this doesn't look like a silent generation bug.
    console.error('QR generation failed: the qrcode-generator library did not load (check network/CDN access).');
    return '<div class="qr-fallback">QR unavailable</div>';
  }
  // qrcode-generator counts bytes assuming one char == one byte, which
  // undercounts multi-byte UTF-8 text (e.g. Bengali/Hindi). Re-encode to a
  // byte-per-char string first so its size math matches reality.
  const data = unescape(encodeURIComponent(text));
  // typeNumber 0 is NOT an "auto-size" mode the library actually supports —
  // passing it crashes internally (it indexes its RS-block table with
  // typeNumber-1, i.e. -1, and blows up reading .length off undefined).
  // The library's own demo page fakes "auto" by trying sizes itself and
  // using the first one that fits, so we do the same here.
  for(let typeNumber = 1; typeNumber <= 40; typeNumber++){
    try{
      const qr = qrcode(typeNumber, 'M');
      qr.addData(data);
      qr.make();
      return qr.createSvgTag(cellSize||4, 4);
    }catch(err){
      // Too small for this size ("code length overflow" etc) — try the
      // next one up. Only log if even the largest size (40) failed, since
      // that means something is genuinely wrong rather than just "try bigger".
      if(typeNumber === 40){
        console.error('QR generation failed for payload:', text, err);
      }
    }
  }
  return '<div class="qr-fallback">QR unavailable</div>';
}
function bookingQrReady(b){
  return !!(b && b.qrGeneratedAt);
}
// The ticket-sized QR shown inline (confirmation slip, My Queue page).
function ticketQrHTML(b){
  if(!bookingQrReady(b)){
    return '<div class="qr qr-pending" title="QR unavailable">⏳</div>';
  }
  return '<div class="qr">'+svgQrTag(b.qrCode, 3)+'</div>';
}
// Opens a clean, print-ready ticket (real QR + booking details) in a new
// tab and triggers the browser print dialog — usable from the moment a
// slot is booked, from both the farmer's side and the operator's live
// queue/scanner.
function printBookingSlip(bookingId){
  const b = bookingById(bookingId);
  if(!b) return;
  if(!bookingQrReady(b)){ toast('QR code unavailable for this booking.','err'); return; }
  const centre = centreById(b.centreId);
  const crop = cropById(b.cropId);
  const farmer = farmerById(b.farmerId);
  const win = window.open('', '_blank');
  if(!win){ toast('Please allow pop-ups to print the slip.','err'); return; }
  const rows = [
    ['Token', b.tokenNumber],
    ['Farmer', farmer ? farmer.name : '—'],
    ['Centre', centre ? centre.name : '—'],
    ['Crop', crop ? crop.name : '—'],
    ['Date', fmtDate(new Date(b.bookingDate))],
    ['Time', b.time],
  ].map(r=>'<tr><td class="lbl">'+esc(r[0])+'</td><td class="val">'+esc(r[1])+'</td></tr>').join('');
  win.document.write(
    '<!DOCTYPE html><html><head><title>Token '+esc(b.tokenNumber)+' — KisanSetu</title><meta charset="UTF-8">'+
    '<style>'+
      'body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#16231C;}'+
      '.wrap{max-width:360px;margin:0 auto;border:2px dashed #16231C;border-radius:10px;padding:22px;text-align:center;}'+
      'h1{font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;color:#5B7A5B;}'+
      '.token{font-size:38px;font-weight:800;font-family:"Courier New",monospace;margin-bottom:14px;}'+
      'table{width:100%;border-collapse:collapse;text-align:left;margin-top:14px;}'+
      'td{padding:5px 0;font-size:13px;border-top:1px solid #ddd;}'+
      'td.lbl{color:#666;width:40%;} td.val{font-weight:700;text-align:right;}'+
      '@media print{ body{padding:0;} .wrap{border-style:solid;} }'+
    '</style></head><body>'+
    '<div class="wrap">'+
      '<h1>Official Procurement Token</h1>'+
      '<div class="token">'+esc(b.tokenNumber)+'</div>'+
      svgQrTag(b.qrCode, 5)+
      '<table>'+rows+'</table>'+
    '</div>'+
    '</body></html>'
  );
  win.document.close();
  triggerPopupPrint(win);
}
// Fires window.print() on a just-opened, just-written popup. This is set
// from the OPENER's own script rather than injected as a `<script>` tag
// inside the written HTML string — writing "<script>...<\/script>" as text
// is fragile: the backslash there means the browser's HTML parser doesn't
// recognize it as a real closing tag, so the block never actually closes,
// the trailing `</body></html>` gets swallowed into it as invalid
// JavaScript, and the whole inline script silently fails — window.print()
// never runs at all (this was the actual bug, not just a delay). Doing it
// from here avoids string-escaping HTML/JS together entirely. win.focus()
// plus a short delay avoids the OS print dialog failing to surface
// immediately because the new window hasn't taken focus yet.
function triggerPopupPrint(win){
  win.onload = function(){
    setTimeout(function(){
      try{ win.focus(); win.print(); }catch(err){ /* pop-up may have been closed already */ }
    }, 150);
  };
}

/* ---------------- FARMER: queue tracking ---------------- */
function renderFarmerQueue(){
  const booking = farmerActiveBooking();
  if(!booking){
    return '<div class="h1">My Queue</div><div class="card empty"><div class="big">🎟</div><b>No active token</b>'+
      '<p class="small mt10">Book a slot to receive a token and track your position live.</p>'+
      '<button class="btn btn-primary mt14" data-action="nav" data-route="farmer/book">📅 Book a Slot</button></div>';
  }
  const centre = centreById(booking.centreId);
  const q = state.db.queue[booking.id];
  const info = queuePositionInfo(centre, booking.id);
  const stages = ['booked','waiting','called','in-procurement','completed'];
  const stageLabel = {booked:'Booked',waiting:'Waiting',called:'Called',['in-procurement']:'Procurement',completed:'Completed'};
  const curIdx = stages.indexOf(q.status==='waiting'?'waiting':q.status);
  const soon = info && info.peopleAhead<=2 && q.status==='waiting';
  return '<div class="h1">Track My Queue</div>'+
    '<div class="grid grid-2">'+
      '<div class="ticket">'+
        '<div class="top"><div class="stamp">Live Token</div>'+queueBadge(q.status)+'</div>'+
        '<div class="token-num">'+booking.tokenNumber+'</div>'+
        '<div class="meta">'+centre.name+'</div>'+
        '<div class="dashline"></div>'+
        '<div class="row"><span>'+t('now_serving')+'</span><b>'+(nowServingToken(centre)||'—')+'</b></div>'+
        '<div class="row"><span>'+t('people_ahead')+'</span><b>'+(info?info.peopleAhead:0)+'</b></div>'+
        '<div class="row"><span>'+t('est_wait')+'</span><b>'+(info?info.estWait:0)+' minutes</b></div>'+
        (bookingQrReady(booking) ?
          '<div class="dashline"></div>'+
          '<div style="display:flex;flex-direction:column;align-items:center;gap:10px">'+ticketQrHTML(booking)+
          '<button class="btn btn-outline btn-sm" data-action="print-qr" data-id="'+booking.id+'">🖨️ Print QR token</button></div>'
          : '')+
      '</div>'+
      '<div class="card">'+
        '<b>Appointment details</b>'+
        '<div class="grid grid-2 mt14">'+
          '<div><div class="small">Date</div><b>'+fmtDate(new Date(booking.bookingDate))+'</b></div>'+
          '<div><div class="small">Time</div><b>'+booking.time+'</b></div>'+
        '</div>'+
        (soon ? '<div class="mt14" style="background:var(--wheat-tint);border:1px solid var(--wheat);border-radius:8px;padding:10px 12px;color:var(--wheat-deep);font-weight:700;font-size:12.5px">⏳ Your turn is coming soon. Please stay near the procurement centre.</div>' : '')+
        (q.status==='called' ? '<div class="mt14" style="background:var(--green-tint);border:1px solid var(--green);border-radius:8px;padding:10px 12px;color:var(--green-deep);font-weight:700;font-size:12.5px">📣 You have been called! Please proceed to the counter.</div>' : '')+
        (['waiting','called'].includes(q.status) ? '<button class="btn btn-danger btn-block mt14" data-action="cancel-booking" data-id="'+booking.id+'">Cancel this booking</button>' : '')+
      '</div>'+
    '</div>'+
    '<div class="card mt18">'+
      '<b>Progress</b>'+
      '<div class="progress-track">'+
        ['Booked','Checked In','Waiting','Called','Procurement','Completed'].map((lbl,i)=>{
          const map2 = ['booked','booked','waiting','called','in-procurement','completed'];
          const mine = map2.indexOf(q.status==='waiting'?'waiting':q.status);
          const cls = i<mine?'done':i===mine?'active':'';
          return '<div class="progress-node '+cls+'"><div class="circle">'+(i<mine?'✓':i+1)+'</div><div class="lbl">'+lbl+'</div></div>';
        }).join('')+
      '</div>'+
    '</div>';
}

/* ---------------- FARMER: payments ---------------- */
function renderFarmerPayments(){
  const f = currentFarmer();
  const procs = state.db.procurements.filter(p=>p.farmerId===f.id).sort((a,b)=>b.createdAt-a.createdAt);
  const rows = procs.map(p=>{
    const pay = state.db.payments.find(pm=>pm.procurementId===p.id);
    const crop = cropById(p.cropId);
    return '<tr><td class="mono">'+p.id+'</td><td>'+fmtDate(p.createdAt)+'</td><td>'+(crop?crop.name:'—')+'</td>'+
      '<td>'+p.quantity+' '+p.unit+'</td><td class="mono">'+fmtINR(p.net)+'</td><td>'+(pay?payBadge(pay.status):'—')+'</td></tr>';
  }).join('');
  const latest = state.db.payments.filter(p=>p.farmerId===f.id).sort((a,b)=>b.id.localeCompare(a.id))[0];
  return '<div class="h1">Payment Status</div>'+
    (latest ? '<div class="card mb18" style="border-color:var(--wheat)">'+
      '<div class="flex-between"><div><div class="small">Most recent procurement amount</div><div class="h2" style="margin:4px 0">'+fmtINR(latest.amount)+'</div></div>'+payBadge(latest.status)+'</div>'+
      (latest.status==='Completed' ? '<p class="small mt10">Payment of '+fmtINR(latest.amount)+' has been successfully processed'+(latest.transactionRef?' · Ref '+latest.transactionRef:'')+'.</p>'
        : latest.status==='Failed' ? '<p class="small mt10" style="color:#B23A2E">This payment could not be processed. Please contact the procurement centre to resolve it.</p>'
        : '<p class="small mt10">Your payment is being processed by the bank. This usually completes within a few minutes.</p>')+
    '</div>' : '')+
    '<div class="card"><table><thead><tr><th>Procurement ID</th><th>Date</th><th>Crop</th><th>Quantity</th><th>Amount</th><th>Payment</th></tr></thead>'+
    '<tbody>'+(rows||'<tr><td colspan="6" class="empty">No procurement records yet.</td></tr>')+'</tbody></table></div>';
}

/* ---------------- FARMER: history ---------------- */
function renderFarmerHistory(){
  const f = currentFarmer();
  const procs = state.db.procurements.filter(p=>p.farmerId===f.id).sort((a,b)=>b.createdAt-a.createdAt);
  return '<div class="h1">Procurement History</div><p class="sub">Tap a record to view full details.</p>'+
    '<div class="grid grid-2">'+procs.map(p=>{
      const crop = cropById(p.cropId); const pay = state.db.payments.find(pm=>pm.procurementId===p.id);
      return '<div class="card">'+
        '<div class="flex-between"><b>'+fmtDate(p.createdAt)+'</b>'+(pay?payBadge(pay.status):'')+'</div>'+
        '<div class="small mt10">'+(crop?crop.name:'—')+' · '+p.quantity+' '+p.unit+' · Quality '+p.quality+'</div>'+
        '<div class="divider"></div>'+
        '<div class="grid grid-2">'+
          '<div><div class="small">Rate</div><b>'+fmtINR(p.rate)+' / '+p.unit+'</b></div>'+
          '<div><div class="small">Gross Amount</div><b>'+fmtINR(p.gross)+'</b></div>'+
          '<div><div class="small">Deductions</div><b>'+fmtINR(p.deductions)+'</b></div>'+
          '<div><div class="small">Net Payable</div><b style="color:var(--green-deep)">'+fmtINR(p.net)+'</b></div>'+
        '</div>'+
      '</div>';
    }).join('')+(procs.length?'':'<div class="card empty">No procurement history yet.</div>')+'</div>';
}

/* ---------------- FARMER: notifications ---------------- */
function renderFarmerNotifications(){
  const f = currentFarmer();
  const list = state.db.notifications.filter(n=>n.userId===f.id).sort((a,b)=>b.createdAt-a.createdAt);
  const icons = {booking:'📅',reminder:'⏰',queue:'📍',called:'📣',procurement:'🌾',payment:'💰',cancel:'❌',absent:'⚠️',info:'🔔'};
  return '<div class="h1">Notifications</div>'+
    (list.length ? '<button class="btn btn-outline btn-sm mb14" data-action="mark-all-read">Mark all as read</button>' : '')+
    '<div class="card">'+
    list.map(n=>'<div class="notif-item'+(n.read?'':' unread')+'"><div class="notif-ic">'+(icons[n.type]||'🔔')+'</div>'+
      '<div style="flex:1"><b style="font-size:13px">'+n.title+'</b><div class="small mt10" style="line-height:1.5">'+n.message+'</div>'+
      '<div class="small" style="margin-top:6px">'+n.createdAt.toLocaleString('en-IN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'})+'</div></div></div>').join('')+
    (list.length?'':'<div class="empty">No notifications yet.</div>')+
    '</div>';
}

/* ---------------- FARMER: profile ---------------- */
function renderFarmerProfile(){
  const f = currentFarmer();
  const formHtml = state.showProfileForm ? '<div class="card mb18">'+
    '<div class="flex-between mb10"><b>Edit profile</b><span class="link" data-action="profile-form-close">✕</span></div>'+
    (state.profileFormError?'<div class="small mb10" style="color:#B23A2E">'+esc(state.profileFormError)+'</div>':'')+
    mgmtField('profileForm','Full name','name')+
    mgmtField('profileForm','Email','email',{type:'email', placeholder:'you@example.com'})+
    '<div class="grid grid-2">'+mgmtField('profileForm','Village','village')+mgmtField('profileForm','District','district')+'</div>'+
    '<div class="grid grid-2">'+mgmtField('profileForm','State','state')+mgmtField('profileForm','Main crop','mainCrop')+'</div>'+
    mgmtField('profileForm','Land (acres)','landAcres')+
    '<button class="btn btn-primary btn-sm" data-action="profile-form-submit">Save changes</button>'+
  '</div>' : '';
  return '<div class="h1">My Profile</div>'+
    (state.showProfileForm ? '' : '<button class="btn btn-outline btn-sm mb14" data-action="profile-form-open">✏️ Edit profile</button>')+
    formHtml+
    '<div class="grid grid-2">'+
    '<div class="card">'+
      '<b>Personal details</b><div class="divider"></div>'+
      profileRow('Full Name', f.name)+profileRow('Farmer ID', f.farmerId)+profileRow('Mobile Number', maskMobile(f.mobile))+
      profileRow('Email', f.email||'—')+profileRow('Preferred Language', ({en:'English',hi:'Hindi',bn:'Bengali'})[f.language])+
    '</div>'+
    '<div class="card">'+
      '<b>Location</b><div class="divider"></div>'+
      profileRow('Village', f.village)+profileRow('District', f.district)+profileRow('State', f.state)+
    '</div>'+
    '<div class="card">'+
      '<b>Farming details</b><div class="divider"></div>'+
      profileRow('Main Crop', f.mainCrop)+profileRow('Land Holding', f.landAcres+' acres')+
    '</div>'+
    '<div class="card">'+
      '<b>Bank &amp; verification</b><div class="divider"></div>'+
      profileRow('Bank Account Status', f.bankStatus==='Linked'?'<span class="badge badge-done">Linked ✓</span>':'<span class="badge badge-waiting">Pending</span>')+
      '<p class="small mt10">Account number and IFSC are kept on file with the bank and are not displayed here for your security.</p>'+
    '</div>'+
    '</div>';
}
function profileRow(l,v){ return '<div class="flex-between mt10" style="font-size:13px"><span class="small">'+l+'</span><b>'+v+'</b></div>'; }
function maskMobile(m){ return m.slice(0,2)+'••••'+m.slice(-4); }

/* ---------------- OPERATOR ---------------- */
function operatorTodayBookings(centre){
  return centre.queueOrder.map(bid=>({b:bookingById(bid), q:state.db.queue[bid]}));
}
function operatorAllBookingsForCentre(centre){
  // Every booking this centre has ever had, any date — unlike
  // operatorTodayBookings() (which is deliberately scoped to today, for the
  // live queue), this is what Payments/Reports need so an operator can look
  // back at past days, not just today.
  return state.db.bookings.filter(b=>b.centreId===centre.id).map(b=>({b, q:state.db.queue[b.id]}));
}
function isoToBookingDate(iso){ // '2026-08-29' -> 'Sat Aug 29 2026' (matches booking.bookingDate)
  if(!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m-1, d).toDateString();
}
function bookingDateToIso(ds){ // 'Sat Aug 29 2026' -> '2026-08-29'
  const d = new Date(ds);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function getOpPayFilter(){
  if(!state.opPayFilter) state.opPayFilter = { q:'', date:'', status:'all' };
  return state.opPayFilter;
}
function getOpReportDateIso(){
  if(state.opReportDateIso===undefined) state.opReportDateIso = bookingDateToIso(TODAY.toDateString());
  return state.opReportDateIso;
}
// Opens a print-friendly window for any table/report built from the portal —
// used by both the Payments page and the Reports page print buttons.
function printDocument(title, bodyHtml){
  const win = window.open('', '_blank');
  if(!win){ toast('Please allow pop-ups to print.','err'); return; }
  win.document.write(
    '<!DOCTYPE html><html><head><title>'+esc(title)+' — KisanSetu</title><meta charset="UTF-8">'+
    '<style>'+
      'body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#16231C;}'+
      'h1{font-size:20px;margin:0 0 4px;} .sub{color:#666;font-size:13px;margin:0 0 20px;}'+
      'table{width:100%;border-collapse:collapse;text-align:left;}'+
      'th,td{padding:7px 10px;font-size:13px;border-bottom:1px solid #ddd;}'+
      'th{color:#666;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;}'+
      '.badge{padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;}'+
      '@media print{ body{padding:0;} }'+
    '</style></head><body>'+
    bodyHtml+
    '</body></html>'
  );
  win.document.close();
  triggerPopupPrint(win);
}
function renderOperatorCentreSwitch(){
  // Operators are assigned to exactly one centre when their account is
  // created (by an admin), so this is now a fixed label, not a switcher.
  const c = centreById(state.operatorCentreId);
  return '<div class="card mb14" style="padding:10px 14px"><b>📍 '+(c?c.name:'—')+'</b><span class="small"> — your assigned centre</span></div>';
}
function renderOperatorDashboard(){
  const centre = centreById(state.operatorCentreId);
  const rows = operatorTodayBookings(centre);
  const total = rows.length;
  // A farmer who reached the counter has "arrived" whether their payment
  // ultimately went through or not — a failed payment is still an arrival.
  const arrived = rows.filter(r=>['waiting','called','in-procurement','completed','failed'].includes(r.q.status)).length;
  const waiting = rows.filter(r=>r.q.status==='waiting').length;
  const inProc = rows.filter(r=>r.q.status==='called'||r.q.status==='in-procurement').length;
  const completed = rows.filter(r=>r.q.status==='completed').length;
  const failed = rows.filter(r=>r.q.status==='failed').length;
  const pendingPay = state.db.payments.filter(p=> rows.some(r=>r.b.id && state.db.procurements.find(pr=>pr.id===p.procurementId && pr.bookingId===r.b.id)) && p.status!=='Completed').length;
  const avgWait = centre.avgProcessMin * Math.max(0, waiting);

  const stats = [['Total Bookings',total],['Arrived',arrived],['Waiting',waiting],['In Progress',inProc],['Completed',completed],['Failed',failed],['Avg Wait (min)',avgWait]];
  return '<div class="h1">Operator Dashboard</div><p class="sub">'+centre.name+' · '+fmtDate(TODAY)+'</p>'+
    renderOperatorCentreSwitch()+
    '<div class="grid grid-4 mb18">'+stats.map(([l,v])=>'<div class="stat"><div class="label">'+l+'</div><div class="value">'+v+'</div></div>').join('')+'</div>'+
    '<div class="card">'+
      '<div class="flex-between mb10"><b>Live Queue</b><span class="small">'+t('now_serving')+': <b class="mono">'+(nowServingToken(centre)||'—')+'</b></span></div>'+
      '<table><thead><tr><th>Token</th><th>Farmer</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
      rows.filter(r=>['waiting','called','in-procurement'].includes(r.q.status)).map(r=>{
        const f = farmerById(r.b.farmerId);
        let actions='';
        // Calling a waiting token is a plain action — no scanning yet, since
        // the farmer isn't necessarily even at the counter when they're
        // called. The scan happens next, once they arrive (see 'called' below).
        if(r.q.status==='waiting') actions = '<button class="btn btn-primary btn-sm" data-action="op-call" data-id="'+r.b.id+'">Call</button> <button class="btn btn-danger btn-sm" data-action="op-absent" data-id="'+r.b.id+'">Absent</button>';
        // The farmer has been called and (assumed) is now at the counter.
        // Before any procurement or payment can happen, the operator scans
        // their ticket to verify it's really this token — this is the only
        // QR-related action anywhere in the operator portal.
        if(r.q.status==='called') actions = '<button class="btn btn-gold btn-sm" data-action="op-scan-verify" data-id="'+r.b.id+'">📷 Scan to Verify</button> <button class="btn btn-danger btn-sm" data-action="op-absent" data-id="'+r.b.id+'">Absent</button>';
        // Procurement's been recorded and payment is settling — nothing
        // left to do here but wait for it to resolve to Completed or Failed.
        if(r.q.status==='in-procurement') actions = '<span class="small">⏳ Processing payment…</span>';
        return '<tr><td class="mono">'+r.b.tokenNumber+'</td><td>'+esc(f.name)+'</td><td>'+r.b.time+'</td><td>'+queueBadge(r.q.status)+'</td><td>'+actions+'</td></tr>';
      }).join('')+
      '</tbody></table>'+
      (rows.filter(r=>['waiting','called','in-procurement'].includes(r.q.status)).length?'':'<div class="empty">Queue is empty for now.</div>')+
    '</div>';
}
function renderOperatorCrops(){
  const centre = centreById(state.operatorCentreId);
  const catalog = centreCropCatalog(centre);
  const formHtml = state.showCropForm ? '<div class="card mb18">'+
    '<div class="flex-between mb10"><b>'+(state.editingCropId?'Edit crop':'Add a new crop')+'</b><span class="link" data-action="crop-form-close">✕</span></div>'+
    (state.cropFormError?'<div class="small mb10" style="color:#B23A2E">'+esc(state.cropFormError)+'</div>':'')+
    mgmtField('cropForm','Crop name','name')+
    '<div class="grid grid-2">'+mgmtField('cropForm','Unit (e.g. kg)','unit')+mgmtField('cropForm','Rate (₹ per unit)','rate',{type:'number'})+'</div>'+
    '<button class="btn btn-primary btn-sm" data-action="crop-form-submit">'+(state.editingCropId?'Save changes':'Add crop')+'</button>'+
  '</div>' : '';
  return '<div class="h1">Manage Crops</div><p class="sub">'+centre.name+' — your assigned centre\'s crop-seed catalog</p>'+
    renderOperatorCentreSwitch()+
    '<button class="btn btn-gold btn-sm mb14" data-action="crop-form-new">+ Add crop</button>'+
    formHtml+
    '<div class="card"><table><thead><tr><th>Crop</th><th>Unit</th><th>Rate (₹)</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
    catalog.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc(c.unit)+'</td><td class="mono">'+fmtINR(c.rate)+'</td>'+
      '<td>'+(c.status==='inactive'?'<span class="badge badge-absent">Inactive</span>':'<span class="badge badge-done">Active</span>')+'</td>'+
      '<td><span class="link" data-action="crop-form-edit" data-id="'+c.id+'">Edit</span> · '+
      '<span class="link" data-action="crop-delete" data-id="'+c.id+'">Remove</span></td></tr>'
    ).join('')+'</tbody></table>'+(catalog.length?'':'<div class="empty">No crops in this centre\'s catalog yet.</div>')+'</div>';
}
function renderOperatorPayments(){
  const centre = centreById(state.operatorCentreId);
  const filter = getOpPayFilter();
  // This is this centre's transaction history — every booking that has
  // reached a final, resolved state, whichever way it resolved — across
  // every date, not just today.
  let rows = operatorAllBookingsForCentre(centre).filter(r=>['completed','failed'].includes(r.q.status));

  if(filter.date) rows = rows.filter(r=>r.b.bookingDate === isoToBookingDate(filter.date));
  if(filter.status!=='all') rows = rows.filter(r=>r.q.status===filter.status);
  if(filter.q.trim()){
    const needle = filter.q.trim().toLowerCase();
    rows = rows.filter(r=>{
      const f = farmerById(r.b.farmerId);
      return (r.b.tokenNumber||'').toLowerCase().includes(needle) || (f && f.name.toLowerCase().includes(needle));
    });
  }
  rows.sort((a,b)=> new Date(b.b.bookingDate)-new Date(a.b.bookingDate) || (b.b.tokenNumber||'').localeCompare(a.b.tokenNumber||''));

  const rowsHtml = rows.map(r=>{
    const proc = state.db.procurements.find(p=>p.bookingId===r.b.id);
    const pay = proc && state.db.payments.find(p=>p.procurementId===proc.id);
    const f = farmerById(r.b.farmerId);
    return '<tr><td class="mono">'+r.b.tokenNumber+'</td><td>'+esc(f?f.name:'—')+'</td><td>'+fmtDate(new Date(r.b.bookingDate))+'</td><td class="mono">'+(pay?fmtINR(pay.amount):'—')+'</td><td>'+(pay?payBadge(pay.status):'—')+'</td><td class="mono">'+(pay&&pay.transactionRef?pay.transactionRef:'—')+'</td></tr>';
  }).join('');

  return '<div class="h1">Payments</div><p class="sub">'+centre.name+'</p>'+renderOperatorCentreSwitch()+
    '<div class="card mb14"><div class="flex-between" style="flex-wrap:wrap;gap:10px;align-items:center">'+
      '<form data-action="op-pay-search-form" style="display:flex;gap:6px"><input type="text" name="q" class="input" style="max-width:220px" placeholder="Search token or farmer…" value="'+esc(filter.q)+'"><button type="submit" class="btn btn-outline btn-sm">🔍</button></form>'+
      '<input type="date" class="input" style="max-width:170px" value="'+esc(filter.date)+'" data-action="op-pay-filter" data-field="date">'+
      '<select class="input" style="max-width:160px" data-action="op-pay-filter" data-field="status">'+
        ['all','completed','failed'].map(s=>'<option value="'+s+'"'+(filter.status===s?' selected':'')+'>'+(s==='all'?'All statuses':s==='completed'?'Completed':'Failed')+'</option>').join('')+
      '</select>'+
      (filter.date||filter.q||filter.status!=='all' ? '<button class="btn btn-outline btn-sm" data-action="op-pay-clear">Clear filters</button>' : '')+
      '<button class="btn btn-outline btn-sm" data-action="print-op-payments">🖨️ Print</button>'+
    '</div></div>'+
    '<div class="card"><table><thead><tr><th>Token</th><th>Farmer</th><th>Date</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>'+
    rowsHtml+'</tbody></table>'+(rows.length?'':'<div class="empty">No matching payment records.</div>')+'</div>';
}
function printOperatorPayments(){
  const centre = centreById(state.operatorCentreId);
  const filter = getOpPayFilter();
  let rows = operatorAllBookingsForCentre(centre).filter(r=>['completed','failed'].includes(r.q.status));
  if(filter.date) rows = rows.filter(r=>r.b.bookingDate === isoToBookingDate(filter.date));
  if(filter.status!=='all') rows = rows.filter(r=>r.q.status===filter.status);
  if(filter.q.trim()){
    const needle = filter.q.trim().toLowerCase();
    rows = rows.filter(r=>{ const f = farmerById(r.b.farmerId); return (r.b.tokenNumber||'').toLowerCase().includes(needle) || (f && f.name.toLowerCase().includes(needle)); });
  }
  rows.sort((a,b)=> new Date(b.b.bookingDate)-new Date(a.b.bookingDate) || (b.b.tokenNumber||'').localeCompare(a.b.tokenNumber||''));
  const rowsHtml = rows.map(r=>{
    const proc = state.db.procurements.find(p=>p.bookingId===r.b.id);
    const pay = proc && state.db.payments.find(p=>p.procurementId===proc.id);
    const f = farmerById(r.b.farmerId);
    return '<tr><td>'+r.b.tokenNumber+'</td><td>'+esc(f?f.name:'—')+'</td><td>'+fmtDate(new Date(r.b.bookingDate))+'</td><td>'+(pay?fmtINR(pay.amount):'—')+'</td><td>'+(pay?pay.status:'—')+'</td><td>'+(pay&&pay.transactionRef?pay.transactionRef:'—')+'</td></tr>';
  }).join('');
  printDocument('Payments', '<h1>Payments</h1><p class="sub">'+esc(centre.name)+(filter.date?' · '+esc(fmtDate(new Date(isoToBookingDate(filter.date)))):' · All dates')+(filter.status!=='all'?' · '+esc(filter.status):'')+'</p>'+
    '<table><thead><tr><th>Token</th><th>Farmer</th><th>Date</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>'+rowsHtml+'</tbody></table>');
}
function renderOperatorReports(){
  const centre = centreById(state.operatorCentreId);
  const iso = getOpReportDateIso();
  const targetDate = isoToBookingDate(iso);
  const isToday = targetDate === TODAY.toDateString();
  const rows = operatorAllBookingsForCentre(centre).filter(r=>r.b.bookingDate===targetDate);

  const byStatus = {};
  rows.forEach(r=>{ byStatus[r.q.status]=(byStatus[r.q.status]||0)+1; });
  const max = Math.max(1,...Object.values(byStatus));

  const revenueRows = rows.filter(r=>r.q.status==='completed').map(r=>{
    const proc = state.db.procurements.find(p=>p.bookingId===r.b.id);
    const pay = proc && state.db.payments.find(p=>p.procurementId===proc.id);
    return pay ? pay.amount : 0;
  });
  const revenue = revenueRows.reduce((a,b)=>a+b,0);
  const failedCount = byStatus['failed']||0;

  return '<div class="h1">Daily Statistics</div><p class="sub">'+centre.name+' · '+fmtDate(new Date(targetDate))+(isToday?' (Today)':'')+'</p>'+renderOperatorCentreSwitch()+
    '<div class="card mb14"><div class="flex-between" style="flex-wrap:wrap;gap:10px;align-items:center">'+
      '<label class="small">Date: <input type="date" class="input" style="max-width:170px" value="'+esc(iso)+'" data-action="op-report-date"></label>'+
      (!isToday?'<button class="btn btn-outline btn-sm" data-action="op-report-today">Jump to today</button>':'')+
      '<button class="btn btn-outline btn-sm" data-action="print-op-reports">🖨️ Print</button>'+
    '</div></div>'+
    '<div class="card"><b>Bookings by status</b><div class="bar-chart mt14">'+
    (Object.keys(byStatus).length ? Object.entries(byStatus).map(([k,v])=>'<div class="bar-col"><div class="bar" style="height:'+Math.max(6,(v/max*130))+'px"><span class="bar-val">'+v+'</span></div><div class="bar-lbl">'+k+'</div></div>').join('') : '<div class="empty">No bookings on this date.</div>')+
    '</div></div>'+
    '<div class="card mt14"><b>Summary</b>'+
      profileRow('Total bookings', rows.length)+
      profileRow('Completed', byStatus['completed']||0)+
      profileRow('Failed payments', failedCount)+
      profileRow('Revenue collected', fmtINR(revenue))+
    '</div>';
}
function printOperatorReports(){
  const centre = centreById(state.operatorCentreId);
  const iso = getOpReportDateIso();
  const targetDate = isoToBookingDate(iso);
  const rows = operatorAllBookingsForCentre(centre).filter(r=>r.b.bookingDate===targetDate);
  const byStatus = {};
  rows.forEach(r=>{ byStatus[r.q.status]=(byStatus[r.q.status]||0)+1; });
  const revenueRows = rows.filter(r=>r.q.status==='completed').map(r=>{
    const proc = state.db.procurements.find(p=>p.bookingId===r.b.id);
    const pay = proc && state.db.payments.find(p=>p.procurementId===proc.id);
    return pay ? pay.amount : 0;
  });
  const revenue = revenueRows.reduce((a,b)=>a+b,0);
  const statusRows = Object.entries(byStatus).map(([k,v])=>'<tr><td>'+k+'</td><td>'+v+'</td></tr>').join('');
  printDocument('Daily Statistics', '<h1>Daily Statistics</h1><p class="sub">'+esc(centre.name)+' · '+esc(fmtDate(new Date(targetDate)))+'</p>'+
    '<table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>'+statusRows+'</tbody></table>'+
    '<table style="margin-top:20px"><tbody>'+
      '<tr><th>Total bookings</th><td>'+rows.length+'</td></tr>'+
      '<tr><th>Completed</th><td>'+(byStatus['completed']||0)+'</td></tr>'+
      '<tr><th>Failed payments</th><td>'+(byStatus['failed']||0)+'</td></tr>'+
      '<tr><th>Revenue collected</th><td>'+fmtINR(revenue)+'</td></tr>'+
    '</tbody></table>');
}
function renderOperatorNotifications(){
  return '<div class="h1">Notifications</div><div class="card"><div class="notif-item"><div class="notif-ic">🔔</div>'+
    '<div><b style="font-size:13px">Centre schedule reminder</b><div class="small mt10">Amdanga Procurement Centre closes at 5:00 PM today. 3 slots remain unfilled tomorrow.</div></div></div>'+
    '<div class="notif-item"><div class="notif-ic">⚠️</div><div><b style="font-size:13px">Overload warning</b><div class="small mt10">Deganga Procurement Centre queue is approaching capacity. Consider recommending nearby centres to new bookings.</div></div></div>'+
    '</div>';
}

/* ---------------- procurement entry modal ---------------- */
function renderModal(){
  if(!state.modal) return '';
  if(state.modal.type==='procurement'){
    const b = bookingById(state.modal.bookingId);
    const f = farmerById(b.farmerId);
    const centre = centreById(b.centreId);
    const cropChoices = centreCropCatalog(centre);
    const crop = cropById(state.modal.cropId) || cropChoices[0];
    const qty = parseFloat(state.modal.quantity)||0;
    const gross = qty*crop.rate;
    const ded = Math.round(gross*(parseFloat(state.modal.deductionsPct)||0)/100);
    const net = gross-ded;
    return '<div class="modal-bg" data-action="modal-bg-close"><div class="modal">'+
      '<div class="flex-between mb14"><b style="font-size:16px">Record Procurement — '+b.tokenNumber+'</b><span class="link" data-action="modal-close">✕</span></div>'+
      '<p class="small mb14">Farmer: <b>'+esc(f.name)+'</b> · '+f.farmerId+'</p>'+
      '<div class="field"><label>Crop</label><select id="m-crop" data-action="modal-set-crop">'+cropChoices.map(c=>'<option value="'+c.id+'"'+(c.id===crop.id?' selected':'')+'>'+c.name+' ('+fmtINR(c.rate)+'/'+c.unit+')</option>').join('')+'</select><div class="hint">Only crops this centre procures are listed. Defaults to what the farmer booked.</div></div>'+
      '<div class="grid grid-2">'+
        '<div class="field"><label>Quantity ('+crop.unit+')</label><input id="m-qty" type="number" min="0" value="'+state.modal.quantity+'" data-action="modal-set-qty"></div>'+
        '<div class="field"><label>Quality / Grade</label><select id="m-quality" data-action="modal-set-quality">'+['Grade A','Grade B','Grade C'].map(g=>'<option'+(g===state.modal.quality?' selected':'')+'>'+g+'</option>').join('')+'</select></div>'+
      '</div>'+
      '<div class="field"><label>Deductions (%)</label><input id="m-ded" type="number" min="0" max="20" value="'+state.modal.deductionsPct+'" data-action="modal-set-ded"><div class="hint">Moisture / quality deductions applied to gross amount.</div></div>'+
      '<div class="divider"></div>'+
      '<div class="grid grid-3">'+
        '<div><div class="small">Gross Amount</div><b id="m-gross" class="mono">'+fmtINR(gross)+'</b></div>'+
        '<div><div class="small">Deductions</div><b id="m-dedamt" class="mono">'+fmtINR(ded)+'</b></div>'+
        '<div><div class="small">Net Payable</div><b id="m-net" class="mono" style="color:var(--green-deep)">'+fmtINR(net)+'</b></div>'+
      '</div>'+
      '<button class="btn btn-primary btn-block mt18" data-action="modal-submit-procurement">✅ Complete Procurement</button>'+
    '</div></div>';
  }
  if(state.modal.type==='voice'){
    return '<div class="modal-bg" data-action="modal-bg-close"><div class="modal">'+renderVoicePanelBody()+'</div></div>';
  }
  if(state.modal.type==='scan'){
    return '<div class="modal-bg" data-action="modal-bg-close"><div class="modal modal-scan">'+
      '<div class="flex-between mb14"><b style="font-size:16px">📷 Scan Farmer QR</b><span class="link" data-action="modal-close">✕</span></div>'+
      '<div class="scan-frame"><video id="scanVideo" playsinline muted></video><div class="scan-reticle"></div></div>'+
      '<div id="scanStatus" class="small mt10 center">'+esc(state.modal.status||'Point the camera at the farmer\'s QR token…')+'</div>'+
      '<canvas id="scanCanvas" style="display:none"></canvas>'+
    '</div></div>';
  }
  return '';
}
function recalcModalPreview(){
  const m = state.modal; const crop = cropById(m.cropId);
  const qty = parseFloat(m.quantity)||0; const gross = qty*crop.rate;
  const ded = Math.round(gross*(parseFloat(m.deductionsPct)||0)/100); const net = gross-ded;
  const g=document.getElementById('m-gross'), d=document.getElementById('m-dedamt'), n=document.getElementById('m-net');
  if(g) g.textContent = fmtINR(gross); if(d) d.textContent = fmtINR(ded); if(n) n.textContent = fmtINR(net);
}

/* ---------------- chart helpers ---------------- */
function barChart(items, valueKey, labelKey, opts){
  opts = opts||{};
  const max = Math.max(1, ...items.map(i=>i[valueKey]));
  return '<div class="bar-chart">'+items.map(i=>{
    const h = Math.max(6, (i[valueKey]/max)*130);
    return '<div class="bar-col"><div class="bar'+(opts.gold?' gold':'')+'" style="height:'+h+'px"><span class="bar-val">'+(opts.fmt?opts.fmt(i[valueKey]):i[valueKey])+'</span></div><div class="bar-lbl">'+i[labelKey]+'</div></div>';
  }).join('')+'</div>';
}
function donutChart(segments){
  const total = segments.reduce((a,s)=>a+s.value,0) || 1;
  let acc = 0; const r=42, c=2*Math.PI*r;
  const circles = segments.map(s=>{
    const frac = s.value/total; const dash = frac*c;
    const el = '<circle r="'+r+'" cx="60" cy="60" fill="transparent" stroke="'+s.color+'" stroke-width="16" stroke-dasharray="'+dash+' '+(c-dash)+'" stroke-dashoffset="'+(-acc)+'" transform="rotate(-90 60 60)"/>';
    acc += dash; return el;
  }).join('');
  const legend = segments.map(s=>'<div class="legend-row"><span class="legend-dot" style="background:'+s.color+'"></span>'+s.label+' — <b>'+s.value+'</b></div>').join('');
  return '<div class="donut-wrap"><svg width="120" height="120" viewBox="0 0 120 120">'+circles+'</svg><div>'+legend+'</div></div>';
}

/* ---------------- ADMIN ---------------- */
function renderAdminDashboard(){
  const db = state.db;
  const totalFarmers = db.farmers.length;
  const activeCentres = db.centres.filter(c=>c.status==='active').length;
  const todaysBookings = db.bookings.filter(b=>b.bookingDate===TODAY.toDateString()).length;
  const todaysCompleted = db.centres.reduce((a,c)=>a+activeQueueList(c).length*0,0) +
    db.bookings.filter(b=>b.bookingDate===TODAY.toDateString() && state.db.queue[b.id] && state.db.queue[b.id].status==='completed').length;
  const totalQty = db.procurements.reduce((a,p)=>a+p.quantity,0);
  const totalVal = db.procurements.reduce((a,p)=>a+p.net,0);
  const pendingPay = db.payments.filter(p=>p.status!=='Completed').length;
  const avgWait = Math.round(db.centres.reduce((a,c)=>{ const w=activeQueueList(c).filter(id=>db.queue[id].status==='waiting').length; return a+w*c.avgProcessMin; },0)/db.centres.length);

  const stats = [
    ['Registered Farmers', totalFarmers.toLocaleString('en-IN')],
    ['Active Centres', activeCentres],
    ["Today's Bookings", todaysBookings],
    ["Today's Completed", todaysCompleted],
    ['Total Quantity Procured', totalQty.toLocaleString('en-IN')+' kg'],
    ['Total Procurement Value', fmtINR(totalVal)],
    ['Pending Payments', pendingPay],
    ['Avg Waiting Time', avgWait+' min'],
  ];
  const cropTotals = db.crops.map(c=>({ name:c.name.split(' ')[0], qty: db.procurements.filter(p=>p.cropId===c.id).reduce((a,p)=>a+p.quantity,0) })).filter(x=>x.qty>0);
  const centrePerf = db.centres.map(c=>{
    const rows = c.queueOrder.map(id=>state.db.queue[id]);
    const completed = rows.filter(r=>r.status==='completed').length;
    const waiting = rows.filter(r=>r.status==='waiting').length;
    return { c, completed, waiting, avgWait: waiting*c.avgProcessMin };
  });

  return '<div class="h1">Administrator Dashboard</div><p class="sub">System-wide overview across all procurement centres · '+fmtDate(TODAY)+'</p>'+
    '<div class="grid grid-4 mb18">'+stats.map(([l,v])=>'<div class="stat"><div class="label">'+l+'</div><div class="value">'+v+'</div></div>').join('')+'</div>'+
    '<div class="grid grid-2">'+
      '<div class="card"><b>Daily procurement volume (last 14 days, kg)</b>'+barChart(db.history14.filter((_,i)=>i%2===0||true).slice(-7),'qty','label',{fmt:v=>Math.round(v/1000)+'k'})+'</div>'+
      '<div class="card"><b>Procurement by crop (kg)</b>'+barChart(cropTotals,'qty','name',{gold:true})+'</div>'+
    '</div>'+
    '<div class="card mt14"><b>Centre performance</b><table class="mt10"><thead><tr><th>Centre</th><th>Completed Today</th><th>Waiting Now</th><th>Est. Avg Wait</th></tr></thead><tbody>'+
      centrePerf.map(r=>'<tr><td>'+r.c.name+'</td><td class="mono">'+r.completed+'</td><td class="mono">'+r.waiting+'</td><td class="mono">'+r.avgWait+' min</td></tr>').join('')+
    '</tbody></table></div>';
}
function renderAdminFarmers(){
  const db = state.db;
  const q = (state.search||'').toLowerCase();
  const list = db.farmers.filter(f=> !q || f.name.toLowerCase().includes(q) || f.farmerId.toLowerCase().includes(q) || f.mobile.includes(q)).slice(0,40);
  return '<div class="h1">Manage Farmers</div><p class="sub">'+db.farmers.length+' registered farmers</p>'+
    '<form class="searchbar" data-action="search-form"><input name="q" placeholder="Search by name, Farmer ID or mobile number" value="'+esc(state.search||'')+'"><button class="btn btn-primary btn-sm" type="submit">Search</button></form>'+
    '<div class="card"><table><thead><tr><th>Farmer ID</th><th>Name</th><th>Mobile</th><th>Village</th><th>Main Crop</th><th>Bank</th><th>Status</th></tr></thead><tbody>'+
    list.map(f=>'<tr><td class="mono">'+f.farmerId+'</td><td>'+esc(f.name)+'</td><td class="mono">'+maskMobile(f.mobile)+'</td><td>'+f.village+'</td><td>'+f.mainCrop+'</td>'+
      '<td>'+(f.bankStatus==='Linked'?'<span class="badge badge-done">Linked</span>':'<span class="badge badge-waiting">Pending</span>')+'</td>'+
      '<td><span class="badge badge-booked">'+f.status+'</span></td></tr>').join('')+
    '</tbody></table>'+(list.length?'<p class="small mt10">Showing '+list.length+' of '+db.farmers.length+'.</p>':'<div class="empty">No farmers matched your search.</div>')+'</div>';
}
function mgmtField(bucket, label, name, opts){
  opts = opts||{};
  const type = opts.type||'text';
  const val = esc((state[bucket][name] ?? ''));
  if(opts.select){
    return '<div class="field"><label>'+label+'</label><select data-action="mgmt-field" data-bucket="'+bucket+'" data-field="'+name+'">'+
      opts.select.map(([v,l])=>'<option value="'+v+'"'+(String(state[bucket][name])===String(v)?' selected':'')+'>'+l+'</option>').join('')+
    '</select></div>';
  }
  if(type==='password'){
    const id = 'mgmt-pw-'+bucket+'-'+name;
    return '<div class="field"><label>'+label+'</label><div style="position:relative">'+
      '<input type="password" id="'+id+'" style="padding-right:36px;width:100%;box-sizing:border-box" value="'+val+'" data-action="mgmt-field" data-bucket="'+bucket+'" data-field="'+name+'"'+(opts.placeholder?' placeholder="'+opts.placeholder+'"':'')+'>'+
      passwordToggleHtml(id)+
    '</div></div>';
  }
  return '<div class="field"><label>'+label+'</label><input type="'+type+'" value="'+val+'" data-action="mgmt-field" data-bucket="'+bucket+'" data-field="'+name+'"'+(opts.placeholder?' placeholder="'+opts.placeholder+'"':'')+'></div>';
}
function renderAdminCentres(){
  const db = state.db;
  const isAdmin = state.role==='admin';
  const q = (state.search||'').toLowerCase();
  const list = db.centres.filter(c=> !q || c.name.toLowerCase().includes(q) || c.village.toLowerCase().includes(q) || c.district.toLowerCase().includes(q) || c.tokenPrefix.toLowerCase().includes(q));
  const selectedCropIds = state.centreForm.cropIds || [];
  const formHtml = state.showCentreForm ? '<div class="card mb18">'+
    '<div class="flex-between mb10"><b>'+(state.editingCentreId?'Edit centre':'Add a new centre')+'</b><span class="link" data-action="centre-form-close">✕</span></div>'+
    (state.centreFormError?'<div class="small mb10" style="color:#B23A2E">'+esc(state.centreFormError)+'</div>':'')+
    '<div class="grid grid-2">'+mgmtField('centreForm','Centre name','name')+mgmtField('centreForm','Token prefix (1-3 letters)','tokenPrefix')+'</div>'+
    '<div class="grid grid-3">'+mgmtField('centreForm','Village','village')+mgmtField('centreForm','District','district')+mgmtField('centreForm','State','state')+'</div>'+
    '<div class="grid grid-3">'+mgmtField('centreForm','Capacity / hour','capacityPerHour',{type:'number'})+mgmtField('centreForm','Open time','openTime')+mgmtField('centreForm','Close time','closeTime')+'</div>'+
    mgmtField('centreForm','Distance (km)','distance',{type:'number'})+
    '<div class="field"><label>Crop-seed catalog — which crops does this centre procure?</label>'+
      '<div class="grid grid-3">'+db.crops.map(c=>{
        const checked = selectedCropIds.includes(c.id);
        return '<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:'+(checked?'700':'400')+'">'+
          '<input type="checkbox" data-action="centre-form-crop-toggle" data-id="'+c.id+'"'+(checked?' checked':'')+'> '+c.name+'</label>';
      }).join('')+'</div>'+
      '<div class="hint">Farmers can only book this centre for crops selected here; the operator\'s procurement form is limited to the same list.</div>'+
    '</div>'+
    '<button class="btn btn-primary btn-sm" data-action="centre-form-submit">'+(state.editingCentreId?'Save changes':'Create centre')+'</button>'+
  '</div>' : '';
  return '<div class="h1">Manage Procurement Centres</div>'+
    (isAdmin ? '<button class="btn btn-gold btn-sm mb14" data-action="centre-form-new">+ Add centre</button>' : '')+
    formHtml+
    '<form class="searchbar" data-action="search-form"><input name="q" placeholder="Search by name, village, district or token prefix" value="'+esc(state.search||'')+'"><button class="btn btn-primary btn-sm" type="submit">Search</button></form>'+
    '<div class="grid grid-2">'+
    list.map(c=>{
      const qlen = activeQueueList(c).length;
      const catalog = centreCropCatalog(c).map(cr=>cr.name).join(', ');
      return '<div class="card"><div class="flex-between"><b>'+c.name+'</b><span class="badge badge-done">'+c.status+'</span></div>'+
      '<div class="small mt10">'+c.village+', '+c.district+', '+c.state+'</div>'+
      '<div class="divider"></div>'+
      '<div class="grid grid-3">'+
        '<div><div class="small">Capacity/hr</div><b>'+c.capacityPerHour+'</b></div>'+
        '<div><div class="small">Hours</div><b>'+c.openTime+'–'+c.closeTime+'</b></div>'+
        '<div><div class="small">Live Queue</div><b>'+qlen+'</b></div>'+
      '</div>'+
      '<div class="small mt10"><b>Crops procured:</b> '+(catalog||'—')+'</div>'+
      (isAdmin ? '<div class="mt10"><button class="btn btn-outline btn-sm" data-action="centre-form-edit" data-id="'+c.id+'">Edit</button> '+
        '<button class="btn btn-danger btn-sm" data-action="centre-delete" data-id="'+c.id+'">Delete</button></div>' : '')+
      '</div>';
    }).join('')+'</div>'+(list.length?'':'<div class="empty">No centres matched your search.</div>');
}
function renderAdminOperators(){
  if(!state.operatorsLoaded){ loadOperators(state.search).then(render); return '<div class="h1">Operators</div><div class="empty">Loading…</div>'; }
  const list = state.operators;
  const centreOpts = state.db.centres.map(c=>[c.id, c.name]);
  const formHtml = state.showOperatorForm ? '<div class="card mb18">'+
    '<div class="flex-between mb10"><b>'+(state.editingOperatorId?'Edit operator':'Add a new operator')+'</b><span class="link" data-action="operator-form-close">✕</span></div>'+
    (state.operatorFormError?'<div class="small mb10" style="color:#B23A2E">'+esc(state.operatorFormError)+'</div>':'')+
    mgmtField('operatorForm','Full name','name')+
    mgmtField('operatorForm','Mobile number','mobile',{placeholder:'10-digit mobile number'})+
    mgmtField('operatorForm','Email (optional)','email',{type:'email', placeholder:'you@example.com'})+
    mgmtField('operatorForm','Password'+(state.editingOperatorId?' (leave blank to keep current)':''),'password',{type:'password'})+
    mgmtField('operatorForm','Centre','centreId',{select:centreOpts})+
    '<button class="btn btn-primary btn-sm" data-action="operator-form-submit">'+(state.editingOperatorId?'Save changes':'Create operator')+'</button>'+
  '</div>' : '';
  return '<div class="h1">Manage Operators</div><p class="sub">'+list.length+' operator account(s)</p>'+
    '<button class="btn btn-gold btn-sm mb14" data-action="operator-form-new">+ Add operator</button>'+
    formHtml+
    '<form class="searchbar" data-action="search-form"><input name="q" placeholder="Search by name or mobile number" value="'+esc(state.search||'')+'"><button class="btn btn-primary btn-sm" type="submit">Search</button></form>'+
    '<div class="card"><table><thead><tr><th>Name</th><th>Mobile</th><th>Centre</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
    list.map(o=>{ const c = centreById(o.centreId);
      return '<tr><td>'+esc(o.name)+'</td><td class="mono">'+esc(o.mobile)+'</td><td>'+(c?c.name:'—')+'</td>'+
        '<td>'+(o.status==='active'?'<span class="badge badge-done">Active</span>':'<span class="badge badge-absent">Suspended</span>')+'</td>'+
        '<td><span class="link" data-action="operator-form-edit" data-id="'+o.id+'">Edit</span> · '+
        '<span class="link" data-action="operator-toggle-status" data-id="'+o.id+'">'+(o.status==='active'?'Suspend':'Reactivate')+'</span> · '+
        '<span class="link" data-action="operator-delete" data-id="'+o.id+'">Delete</span></td></tr>';
    }).join('')+'</tbody></table>'+(list.length?'':'<div class="empty">No operators yet.</div>')+'</div>';
}
function renderSuperAdminAdmins(){
  if(!state.adminsLoaded){ loadAdmins(state.search).then(render); return '<div class="h1">Manage Admins</div><div class="empty">Loading…</div>'; }
  const list = state.admins;
  const formHtml = state.showAdminForm ? '<div class="card mb18">'+
    '<div class="flex-between mb10"><b>'+(state.editingAdminId?'Edit admin':'Add a new admin')+'</b><span class="link" data-action="admin-form-close">✕</span></div>'+
    (state.adminFormError?'<div class="small mb10" style="color:#B23A2E">'+esc(state.adminFormError)+'</div>':'')+
    mgmtField('adminForm','Full name','name')+
    mgmtField('adminForm','Mobile number','mobile',{placeholder:'10-digit mobile number'})+
    mgmtField('adminForm','Email (optional)','email',{type:'email', placeholder:'you@example.com'})+
    mgmtField('adminForm','Password'+(state.editingAdminId?' (leave blank to keep current)':''),'password',{type:'password'})+
    '<button class="btn btn-primary btn-sm" data-action="admin-form-submit">'+(state.editingAdminId?'Save changes':'Create admin')+'</button>'+
  '</div>' : '';
  return '<div class="h1">Manage Admins</div><p class="sub">'+list.length+' regular admin account(s)</p>'+
    '<button class="btn btn-gold btn-sm mb14" data-action="admin-form-new">+ Add admin</button>'+
    formHtml+
    '<form class="searchbar" data-action="search-form"><input name="q" placeholder="Search by name or mobile number" value="'+esc(state.search||'')+'"><button class="btn btn-primary btn-sm" type="submit">Search</button></form>'+
    '<div class="card"><table><thead><tr><th>Name</th><th>Mobile</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
    list.map(a=>'<tr><td>'+esc(a.name)+'</td><td class="mono">'+esc(a.mobile)+'</td>'+
        '<td>'+(a.status==='active'?'<span class="badge badge-done">Active</span>':'<span class="badge badge-absent">Suspended</span>')+'</td>'+
        '<td><span class="link" data-action="admin-form-edit" data-id="'+a.id+'">Edit</span> · '+
        '<span class="link" data-action="admin-toggle-status" data-id="'+a.id+'">'+(a.status==='active'?'Suspend':'Reactivate')+'</span> · '+
        '<span class="link" data-action="admin-delete" data-id="'+a.id+'">Delete</span></td></tr>').join('')+
    '</tbody></table>'+(list.length?'':'<div class="empty">No admins yet — you\'re the only account so far.</div>')+'</div>';
}
function renderAdminBookings(){
  const db = state.db;
  const q = (state.search||'').toLowerCase();
  const list = db.bookings.filter(b=> !q || b.tokenNumber.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)).slice(-40).reverse();
  return '<div class="h1">Bookings</div>'+
    '<form class="searchbar" data-action="search-form"><input name="q" placeholder="Search by token number or booking ID" value="'+esc(state.search||'')+'"><button class="btn btn-primary btn-sm" type="submit">Search</button></form>'+
    '<div class="card"><table><thead><tr><th>Token</th><th>Farmer</th><th>Centre</th><th>Date</th><th>Time</th><th>Status</th></tr></thead><tbody>'+
    list.map(b=>{ const f=farmerById(b.farmerId); const c=centreById(b.centreId); const q2=db.queue[b.id];
      return '<tr><td class="mono">'+b.tokenNumber+'</td><td>'+esc(f?f.name:'—')+'</td><td>'+c.name+'</td><td>'+fmtDate(new Date(b.bookingDate))+'</td><td>'+b.time+'</td><td>'+(q2?queueBadge(q2.status):'—')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
}
function renderAdminQueues(){
  const db = state.db;
  return '<div class="h1">Monitor All Queues</div><div class="grid grid-2">'+
    db.centres.map(c=>{
      const list = activeQueueList(c);
      return '<div class="card"><div class="flex-between mb10"><b>'+c.name+'</b><span class="link" data-action="nav-tv-centre" data-id="'+c.id+'">View public display →</span></div>'+
        '<div class="grid grid-3">'+
          '<div class="stat"><div class="label">'+t('now_serving')+'</div><div class="value">'+(nowServingToken(c)||'—')+'</div></div>'+
          '<div class="stat"><div class="label">Waiting</div><div class="value">'+list.filter(id=>db.queue[id].status==='waiting').length+'</div></div>'+
          '<div class="stat"><div class="label">Est. Wait</div><div class="value">'+(list.length*c.avgProcessMin)+'m</div></div>'+
        '</div></div>';
    }).join('')+'</div>';
}
function renderAdminPayments(){
  const db = state.db;
  const byStatus = {Pending:0,Processing:0,Completed:0,Failed:0};
  db.payments.forEach(p=>byStatus[p.status]=(byStatus[p.status]||0)+1);
  const recent = db.payments.slice(-25).reverse();
  return '<div class="h1">Payments</div>'+
    '<div class="card mb18"><b>Payment status breakdown</b>'+donutChart([
      {label:'Completed',value:byStatus.Completed,color:'#2F7D4F'},{label:'Processing',value:byStatus.Processing,color:'#2A4E9E'},
      {label:'Pending',value:byStatus.Pending,color:'#B9791F'},{label:'Failed',value:byStatus.Failed,color:'#B23A2E'}])+'</div>'+
    '<div class="card"><table><thead><tr><th>Payment ID</th><th>Farmer</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>'+
    recent.map(p=>{ const f=farmerById(p.farmerId);
      return '<tr><td class="mono">'+p.id+'</td><td>'+esc(f?f.name:'—')+'</td><td class="mono">'+fmtINR(p.amount)+'</td><td>'+payBadge(p.status)+'</td><td class="mono">'+(p.transactionRef||'—')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
}
function renderAdminAnalytics(){
  const db = state.db;
  return '<div class="h1">Analytics</div><p class="sub">Filters: date range, state, district, block, centre and crop are available in the full production build; this demo shows system-wide trends.</p>'+
    '<div class="grid grid-2">'+
    '<div class="card"><b>Daily procurement volume (14 days, kg)</b>'+barChart(db.history14,'qty','label',{fmt:v=>Math.round(v/1000)+'k'})+'</div>'+
    '<div class="card"><b>Daily procurement value (14 days, ₹)</b>'+barChart(db.history14,'value','label',{gold:true,fmt:v=>Math.round(v/100000)+'L'})+'</div>'+
    '<div class="card"><b>Procurement by district</b>'+barChart(db.centres.map(c=>({name:c.village,qty:c.queueOrder.filter(id=>db.queue[id].status==='completed').length})),'qty','name')+'</div>'+
    '<div class="card"><b>Queue / waiting-time trend by centre (min)</b>'+barChart(db.centres.map(c=>({name:c.village,w:activeQueueList(c).filter(id=>db.queue[id].status==='waiting').length*c.avgProcessMin})),'w','name',{gold:true})+'</div>'+
    '</div>';
}
function renderAdminSettings(){
  const db = state.db;
  return '<div class="h1">System Settings</div><div class="grid grid-2">'+
    '<div class="card"><b>Slot &amp; capacity rules</b><div class="divider"></div>'+
    profileRow('Default slot length','60 minutes')+profileRow('Absence grace window','20 minutes after call')+profileRow('Max bookings per farmer/day','1')+
    '</div>'+
    '<div class="card"><b>Notification channels</b><div class="divider"></div>'+
    profileRow('In-app notifications','<span class="badge badge-done">Enabled</span>')+profileRow('SMS gateway','<span class="badge badge-done">Connected (demo)</span>')+profileRow('Email provider','<span class="badge badge-waiting">Optional</span>')+
    '</div>'+
    '<div class="card"><b>Access control</b><div class="divider"></div>'+
    profileRow('Roles configured','Farmer · Operator · Administrator')+profileRow('Session security','JWT-based (demo)')+
    '</div>'+
    '<div class="card"><b>Audit log (sample)</b><div class="divider"></div>'+
    '<p class="small">'+db.centres.length+' centres · '+db.crops.length+' crops · '+db.bookings.length+' bookings tracked this session.</p>'+
    '</div></div>';
}

/* ---------------- public queue display (TV) ---------------- */
function renderTV(){
  if(!state.db.centres.length){
    return '<div class="tv"><div class="tv-panel"><h4>Loading live queue…</h4></div></div>';
  }
  const centre = centreById(state.tvCentreId || state.db.centres[0].id);
  const list = activeQueueList(centre);
  const waiting = list.filter(id=>state.db.queue[id].status==='waiting').map(id=>bookingById(id).tokenNumber);
  const completedCount = centre.queueOrder.filter(id=>state.db.queue[id].status==='completed').length;
  const now = new Date();
  return '<div class="tv">'+
    '<div class="tv-head"><div><h1>'+centre.name+'</h1><div class="small" style="color:#B9CBBB">'+centre.village+', '+centre.district+'</div></div>'+
    '<div class="clock">'+fmtDate(now)+' · '+fmtTime(now)+'</div></div>'+
    '<div class="tv-grid">'+
      '<div class="tv-panel"><h4>Now Serving</h4><div class="tv-serving">'+(nowServingToken(centre)||'—')+'</div></div>'+
      '<div class="tv-panel"><h4>Next</h4><div class="tv-next">'+(waiting[0]||'—')+'</div></div>'+
      '<div class="tv-panel"><h4>Waiting</h4><div class="tv-wait-list">'+(waiting.slice(1,9).map(tk=>'<div class="tv-wait-chip">'+tk+'</div>').join('')||'<span class="small">Queue clear</span>')+'</div></div>'+
    '</div>'+
    '<div class="tv-panel mt18"><div class="tv-stats">'+
      '<div>'+(centre.avgProcessMin)+' min<span>Avg. time / farmer</span></div>'+
      '<div>'+waiting.length+'<span>Farmers waiting</span></div>'+
      '<div>'+completedCount+'<span>Completed today</span></div>'+
    '</div></div>'+
    '<div class="center small mt18" style="color:#B9CBBB;cursor:pointer" data-action="nav" data-route="landing">← Exit display</div>'+
  '</div>';
}

/* ---------------- MAIN RENDER DISPATCH ---------------- */
function viewBody(){
  const r = state.route;
  if(r==='landing') return {full:true, html:renderLanding()};
  if(r==='login') return {full:true, html:renderLogin()};
  if(r==='login/farmer'||r==='login/operator'||r==='login/admin') return {full:true, html:renderLoginForm(r.split('/')[1])};
  if(r==='register/farmer') return {full:true, html:renderFarmerRegister()};
  if(r==='setup-admin') return {full:true, html:renderSuperAdminSetup()};
  if(r==='tv') return {full:true, html:renderTV()};
  if(!state.authed){ state.route='landing'; return {full:true, html:renderLanding()}; }
  const map = {
    'farmer/dashboard':renderFarmerDashboard, 'farmer/book':renderFarmerBook, 'farmer/confirm':renderFarmerConfirm,
    'farmer/queue':renderFarmerQueue, 'farmer/payments':renderFarmerPayments, 'farmer/history':renderFarmerHistory,
    'farmer/notifications':renderFarmerNotifications, 'farmer/profile':renderFarmerProfile,
    'operator/dashboard':renderOperatorDashboard, 'operator/crops':renderOperatorCrops, 'operator/payments':renderOperatorPayments,
    'operator/reports':renderOperatorReports, 'operator/notifications':renderOperatorNotifications,
    'admin/dashboard':renderAdminDashboard, 'admin/farmers':renderAdminFarmers, 'admin/centres':renderAdminCentres,
    'admin/operators':renderAdminOperators,
    'admin/bookings':renderAdminBookings, 'admin/queues':renderAdminQueues, 'admin/payments':renderAdminPayments,
    'admin/analytics':renderAdminAnalytics, 'admin/settings':renderAdminSettings,
    'superadmin/admins':renderSuperAdminAdmins,
  };
  const fn = map[r] || (state.role==='farmer'?renderFarmerDashboard: state.role==='operator'?renderOperatorDashboard: state.role==='super-admin'?renderSuperAdminAdmins: renderAdminDashboard);
  return { html: fn() };
}
function render(){
  const app = document.getElementById('app');
  const v = viewBody();
  if(v.full){ app.innerHTML = v.html; }
  else { app.innerHTML = renderTopbar() + '<div class="shell">'+renderSidebar()+'<div class="main">'+v.html+'</div></div>'; }
  app.insertAdjacentHTML('beforeend', renderModal());
}

/* ---------------- global event delegation ---------------- */
document.addEventListener('click', function(e){
  const el = e.target.closest('[data-action]');
  if(!el){
    if(e.target.id==='' ) {}
    return;
  }
  const action = el.getAttribute('data-action');
  const id = el.getAttribute('data-id');
  switch(action){
    case 'nav': navigate(el.getAttribute('data-route')); break;
    case 'nav-tv-centre': state.tvCentreId = id; navigate('tv'); break;
    case 'logout': logout(); break;
    case 'wizard-centre': state.bookingWizard.centreId = id; state.bookingWizard.cropId = null; state.bookingWizard.step = 2; state.bookingWizard.idemKey = null; render(); break;
    case 'wizard-crop': state.bookingWizard.cropId = id; state.bookingWizard.step = 3; state.bookingWizard.idemKey = null; render(); break;
    case 'wizard-date': state.bookingWizard.date = el.getAttribute('data-date'); state.bookingWizard.step = 4; state.bookingWizard.idemKey = null; render(); break;
    case 'wizard-slot': state.bookingWizard.slotId = id; state.bookingWizard.step = 5; state.bookingWizard.idemKey = null; render(); break;
    case 'wizard-back': state.bookingWizard.step = Math.max(1, state.bookingWizard.step-1); render(); break;
    case 'wizard-confirm': createBooking(); break;
    case 'voice-open': openVoiceModal(); break;
    case 'voice-start': startVoiceListening(); break;
    case 'voice-stop': stopVoiceListening(); break;
    case 'voice-confirm': handleVoiceFinal('confirm'); break; // tapping the button acts exactly like saying "confirm"
    case 'voice-edit': state.voice.awaitingConfirm = false; render(); break;
    case 'voice-manual': voiceContinueManually(); break;
    case 'voice-cancel-draft': resetVoiceDraft(); state.voice.awaitingConfirm=false; state.voice.transcript=''; state.voice.error=null; render(); break;
    case 'cancel-booking': cancelBooking(id); break;
    case 'mark-all-read': markAllNotificationsRead(); break;
    case 'op-call': callBooking(id); break;
    case 'op-scan-verify': initiateVerifyByScan(id); break;
    case 'op-absent': markAbsent(id); break;
    case 'print-qr': printBookingSlip(id); break;
    case 'op-pay-clear': state.opPayFilter = { q:'', date:'', status:'all' }; render(); break;
    case 'print-op-payments': printOperatorPayments(); break;
    case 'op-report-today': state.opReportDateIso = bookingDateToIso(TODAY.toDateString()); render(); break;
    case 'print-op-reports': printOperatorReports(); break;
    case 'modal-close': closeAnyModal(); break;
    case 'modal-bg-close': if(e.target===el){ closeAnyModal(); } break;
    case 'modal-submit-procurement': submitProcurement(); break;
    // Super Admin — manage normal admins
    case 'admin-form-new': openAdminForm(null); render(); break;
    case 'admin-form-edit': openAdminForm(state.admins.find(a=>a.id===id)); render(); break;
    case 'admin-form-close': closeAdminForm(); break;
    case 'admin-form-submit': submitAdminForm(); break;
    case 'admin-toggle-status': toggleAdminStatus(state.admins.find(a=>a.id===id)); break;
    case 'admin-delete': if(confirm('Delete this admin account? This cannot be undone.')) deleteAdmin(id); break;
    // Admin — manage operators
    case 'operator-form-new': openOperatorForm(null); render(); break;
    case 'operator-form-edit': openOperatorForm(state.operators.find(o=>o.id===id)); render(); break;
    case 'operator-form-close': closeOperatorForm(); break;
    case 'operator-form-submit': submitOperatorForm(); break;
    case 'operator-toggle-status': toggleOperatorStatus(state.operators.find(o=>o.id===id)); break;
    case 'operator-delete': if(confirm('Delete this operator account? This cannot be undone.')) deleteOperator(id); break;
    // Admin — manage centres
    case 'centre-form-new': openCentreForm(null); render(); break;
    case 'centre-form-edit': openCentreForm(centreById(id)); render(); break;
    case 'centre-form-close': closeCentreForm(); break;
    case 'centre-form-submit': submitCentreForm(); break;
    case 'centre-delete': if(confirm('Delete this centre? This is blocked while operators are still assigned to it.')) deleteCentre(id); break;
    case 'centre-form-crop-toggle': toggleCentreFormCrop(id); break;
    // Operator (or Admin): manage a centre's crop-seed catalog
    case 'crop-form-new': openCropForm(null); render(); break;
    case 'crop-form-edit': openCropForm(centreCropCatalog(centreById(state.operatorCentreId)).find(c=>c.id===id)); render(); break;
    case 'crop-form-close': closeCropForm(); break;
    case 'crop-form-submit': submitCropForm(state.operatorCentreId); break;
    case 'crop-delete': if(confirm('Remove this crop from the centre\'s catalog?')) deleteCropFromCentre(state.operatorCentreId, id); break;
    // Farmer: edit own profile
    case 'profile-form-open': openProfileForm(); render(); break;
    case 'profile-form-close': closeProfileForm(); break;
    case 'profile-form-submit': submitProfileForm(); break;
    case 'toggle-pw': {
      const input = document.getElementById(el.getAttribute('data-target'));
      if(input){
        const nowText = input.type==='password';
        input.type = nowText ? 'text' : 'password';
        el.textContent = nowText ? '🙈' : '👁';
      }
      break;
    }
    default: break;
  }
});

document.addEventListener('change', function(e){
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const action = el.getAttribute('data-action');
  if(action==='set-lang'){ state.lang = el.value; render(); }
  else if(action==='voice-lang'){ setVoiceLang(el.value); }
  else if(action==='modal-set-crop'){ state.modal.cropId = el.value; render(); }
  else if(action==='modal-set-quality'){ state.modal.quality = el.value; }
  else if(action==='mgmt-field'){
    const bucket = el.getAttribute('data-bucket'), field = el.getAttribute('data-field');
    state[bucket][field] = el.value;
  }
  // date/status are discrete picks (native date picker, dropdown), so a
  // re-render on 'change' is safe here — unlike the free-text search box
  // below, there's no risk of wiping out mid-keystroke focus.
  else if(action==='op-pay-filter'){ getOpPayFilter()[el.getAttribute('data-field')] = el.value; render(); }
  else if(action==='op-report-date'){ state.opReportDateIso = el.value; render(); }
});

document.addEventListener('input', function(e){
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const action = el.getAttribute('data-action');
  if(action==='modal-set-qty'){ state.modal.quantity = el.value; recalcModalPreview(); }
  else if(action==='modal-set-ded'){ state.modal.deductionsPct = el.value; recalcModalPreview(); }
  else if(action==='auth-field'){
    state.authForm[el.getAttribute('data-field')] = el.value;
  }
  else if(action==='mgmt-field'){
    const bucket = el.getAttribute('data-bucket'), field = el.getAttribute('data-field');
    state[bucket][field] = el.value;
  }
});

document.addEventListener('submit', function(e){
  const el = e.target.closest('[data-action]');
  if(!el) return;
  e.preventDefault();
  const action = el.getAttribute('data-action');
  if(action==='search-form'){
    const q = new FormData(el).get('q');
    state.search = q;
    if(state.route==='admin/operators') loadOperators(q).then(render);
    else if(state.route==='superadmin/admins') loadAdmins(q).then(render);
    else render();
  } else if(action==='op-pay-search-form'){
    getOpPayFilter().q = new FormData(el).get('q') || '';
    render();
  } else if(action==='auth-submit'){
    const form = el.getAttribute('data-form');
    if(form==='login') doLogin(el.getAttribute('data-role'));
    else if(form==='register-farmer') doFarmerRegister();
    else if(form==='setup-admin') doSuperAdminSetup();
  }
});

/* ---------------- boot ---------------- */
async function boot(){
  // Check once whether the one-time Super Admin setup screen should be
  // offered (only true while zero super-admin accounts exist anywhere).
  try{
    const { setupNeeded } = await apiFetch('/auth/setup-status');
    state.setupNeeded = setupNeeded;
  }catch(err){ state.setupNeeded = false; }

  const token = getStoredToken();
  if(token){
    try{
      const { user } = await apiFetch('/auth/me');
      state.authed = true; state.role = user.role; state.userId = user.id;
      state.operatorCentreId = user.role==='operator' ? user.centreId : null;
      await loadState();
      state.route = state.route==='landing' ? (user.role==='super-admin'?'superadmin/admins':user.role+'/dashboard') : state.route;
    }catch(err){
      // stored token is invalid/expired — fall back to a logged-out landing page
      setStoredToken(null);
      state.authed = false; state.role = null; state.userId = null; state.route = 'landing';
    }
  }
  render();
}
boot();