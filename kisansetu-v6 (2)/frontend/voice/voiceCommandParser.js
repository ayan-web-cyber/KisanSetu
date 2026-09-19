/* =========================================================
   KisanSetu — Voice Booking: command / intent parser
   -----------------------------------------------------------
   Turns a raw speech-recognition transcript (English, Bengali, or a
   natural mix) into a structured intent + whatever entities (crop,
   centre, date, time) could be confidently matched against the data
   the caller passes in. This file is PURE — it never touches
   `state`, the DOM, or the API; it only reads the small `ctx` object
   handed to parse() (crops/centres/available dates already loaded by
   script.js) and returns a plain result object. script.js is the only
   place that turns a parsed result into changes to the booking wizard,
   which is what keeps "voice controls the same booking engine as
   manual" true — this file has no way to create a booking itself.

   This is deliberately a lightweight, keyword/pattern-based parser,
   not a general NLP model — it's built to recognise the phrasing
   patterns in the spec (and reasonable variations of them), not to
   understand arbitrary free-form speech. Anything it can't match with
   confidence comes back as intent:'UNKNOWN' or with a field left
   unresolved, so script.js can ask the farmer to repeat or fall back
   to manual selection rather than guessing.
   ========================================================= */
(function(global){

  // ---- normalization -------------------------------------------------
  function normalize(text){
    return (text || '')
      .toLowerCase()
      .replace(/[.,!?।]/g, ' ')   // strip common punctuation incl. Bengali daŗi
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Bengali digits -> ASCII, so "১০" reads as "10"
  const BN_DIGITS = { '০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9' };
  function bnDigitsToAscii(s){
    return (s || '').replace(/[০-৯]/g, d => BN_DIGITS[d]);
  }

  // ---- intent keyword tables (English + Bengali) ----------------------
  // Order matters: checked top to bottom, first confident match wins.
  const INTENT_PATTERNS = [
    { intent:'CONFIRM_BOOKING', words:['confirm booking','confirm the booking','book it','confirmed','confirm','yes please','yes','ok book','নিশ্চিত করুন','নিশ্চিত','হ্যাঁ','বুক করো','বুকিং করো','ঠিক আছে'] },
    { intent:'CANCEL_BOOKING', words:['cancel booking','cancel the booking','cancel this','no cancel','বুকিং বাতিল','বাতিল করো'] },
    { intent:'EDIT_BOOKING', words:['edit booking','change booking','go back','edit','change this','পরিবর্তন করো','ফিরে যাও','সম্পাদনা'] },
    { intent:'CANCEL', words:['cancel','stop','never mind','বাতিল','থামো'] },
    { intent:'MY_BOOKINGS', words:['my bookings','my booking','my queue','show my booking','track my booking','আমার বুকিং','আমার সারি','আমার টোকেন'] },
    { intent:'DASHBOARD', words:['dashboard','home','main menu','go home','ড্যাশবোর্ড','হোম'] },
    { intent:'SHOW_CROPS', words:['show crops','show the crops','which crops','ফসল দেখাও','কি কি ফসল'] },
    { intent:'SHOW_CENTRES', words:['show centres','show centers','which centre','which centres','কেন্দ্র দেখাও'] },
    { intent:'SHOW_SLOTS', words:['show slots','show available slots','which slots','স্লট দেখাও'] },
    { intent:'CHECK_AVAILABILITY', words:['check availability','is it available','availability','খালি আছে কিনা'] },
    // BOOK_SLOT last among the "command" intents since it's the broadest —
    // most utterances that also select a crop/centre/date/time will match
    // this too, and that's fine: BOOK_SLOT is treated as "start/continue
    // booking" and combines with whatever entities were also extracted.
    { intent:'BOOK_SLOT', words:['book a slot','book slot','i want to book','want to book','reserve a slot','book','স্লট বুক করতে চাই','বুক করতে চাই','স্লট বুক করো'] },
  ];

  function matchIntent(normText){
    for(const p of INTENT_PATTERNS){
      for(const w of p.words){
        if(normText.includes(w)) return p.intent;
      }
    }
    return 'UNKNOWN';
  }

  // ---- crop matching ----------------------------------------------------
  // Bengali names for common Indian procurement crops. The crop catalog
  // itself only stores English names (server-side), so spoken Bengali
  // crop words are mapped to the English substring we then look for in
  // ctx.crops — this list only needs to cover common staples, not be
  // exhaustive; anything it misses just falls through to "not matched"
  // and the farmer is asked to pick manually.
  const CROP_ALIASES_BN = {
    'ধান':'paddy', 'চাল':'rice', 'গম':'wheat', 'আলু':'potato', 'ভুট্টা':'maize',
    'পাট':'jute', 'সরিষা':'mustard', 'ডাল':'pulses', 'পেঁয়াজ':'onion', 'আখ':'sugarcane',
    'তুলা':'cotton', 'ছোলা':'gram'
  };

  function matchCrop(normText, crops){
    if(!crops || !crops.length) return null;
    // direct English (or already-transliterated) substring match, longest name first
    // so "paddy" doesn't get pre-empted by a shorter unrelated crop name.
    const sorted = crops.slice().sort((a,b)=>b.name.length-a.name.length);
    for(const c of sorted){
      const n = c.name.toLowerCase();
      if(normText.includes(n)) return c;
      // also try just the first word of multi-word crop names, e.g. "Paddy (Rice)" -> "paddy"
      const firstWord = n.split(/[\s(]/)[0];
      if(firstWord.length > 2 && normText.includes(firstWord)) return c;
    }
    // Bengali alias -> English substring
    for(const bnWord in CROP_ALIASES_BN){
      if(normText.includes(bnWord)){
        const eng = CROP_ALIASES_BN[bnWord];
        const hit = sorted.find(c => c.name.toLowerCase().includes(eng));
        if(hit) return hit;
      }
    }
    return null;
  }

  // ---- centre matching ----------------------------------------------------
  function matchCentre(normText, centres){
    if(!centres || !centres.length) return null;
    const sorted = centres.slice().sort((a,b)=>b.name.length-a.name.length);
    for(const c of sorted){
      const n = c.name.toLowerCase();
      if(normText.includes(n)) return c;
      // try the distinctive first word of the centre name (e.g. "Amdanga"
      // out of "Amdanga Procurement Centre") since farmers naturally say
      // just the place name, not the full official name.
      const firstWord = n.split(' ')[0];
      if(firstWord.length > 3 && normText.includes(firstWord)) return c;
    }
    return null;
  }

  // ---- date matching ----------------------------------------------------
  // availableDates: array of { date: Date, ds: string (toDateString), weekday: 0-6 lowercase-name }
  // built by the caller from the same window the manual date-picker offers,
  // so voice can never select a date the manual UI wouldn't also allow.
  const WEEKDAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  function matchDate(normText, availableDates){
    if(!availableDates || !availableDates.length) return null;
    if(/day after tomorrow|পরশু/.test(normText)) return availableDates[2] || null;
    if(/tomorrow|আগামীকাল|আগামী কাল/.test(normText)) return availableDates[1] || null;
    if(/\btoday\b|আজ(কে)?/.test(normText)) return availableDates[0] || null;
    for(const wd of WEEKDAY_NAMES){
      if(normText.includes(wd)){
        const hit = availableDates.find(d => WEEKDAY_NAMES[d.date.getDay()] === wd);
        if(hit) return hit;
      }
    }
    return null;
  }

  // ---- time matching ----------------------------------------------------
  // slots: array of { id, start (e.g. "09:00 AM"), availableSlots }
  // Returns the matching slot, or null if nothing in the transcript looked
  // like a time, or 'AMBIGUOUS' if a time-of-day word was heard but no
  // specific hour could be pinned to exactly one slot (per spec: ask the
  // farmer to choose rather than guess).
  function matchSlot(normText, slots){
    if(!slots || !slots.length) return null;
    const asciiText = bnDigitsToAscii(normText);

    // explicit "10 am" / "10:30 pm" / "10 a.m."
    let m = asciiText.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
    let hour = null, minute = 0, ampm = null;
    if(m){
      hour = parseInt(m[1], 10);
      minute = m[2] ? parseInt(m[2], 10) : 0;
      ampm = /a/i.test(m[3]) ? 'AM' : 'PM';
    } else {
      // bare hour + a time-of-day word: "10 in the morning", "সকাল ১০টা"
      const hourMatch = asciiText.match(/(\d{1,2})\s*(?:টা)?/);
      const isMorning = /morning|সকাল/.test(asciiText);
      const isEvening = /evening|afternoon|বিকাল|বিকেল|সন্ধ্যা/.test(asciiText);
      if(hourMatch && (isMorning || isEvening)){
        hour = parseInt(hourMatch[1], 10);
        ampm = isMorning ? 'AM' : 'PM';
      }
    }
    if(hour === null || !ampm) return null;

    const wantHH = String(hour).padStart(2,'0') + ':' + String(minute).padStart(2,'0') + ' ' + ampm;
    // exact "HH:MM AM/PM" match first
    let hit = slots.filter(s => s.start === wantHH);
    if(hit.length === 1) return hit[0];
    // fall back to matching just the hour+ampm (covers "10 am" when the
    // slot actually starts at 10:00, 10:15, etc. — but only if that
    // uniquely identifies one slot; otherwise it's genuinely ambiguous)
    const wantHourPrefix = String(hour).padStart(2,'0') + ':';
    hit = slots.filter(s => s.start.startsWith(wantHourPrefix) && s.start.endsWith(ampm));
    if(hit.length === 1) return hit[0];
    if(hit.length > 1) return 'AMBIGUOUS';
    return null;
  }

  // ---- main entry point ----------------------------------------------------
  // ctx: { crops, centres, availableDates, slots }
  // Any of these can be omitted/empty if that step isn't reachable yet —
  // matching for that field is simply skipped.
  function parse(rawText, ctx){
    ctx = ctx || {};
    const normText = normalize(rawText);
    const intent = matchIntent(normText);
    const crop = matchCrop(normText, ctx.crops);
    const centre = matchCentre(normText, ctx.centres);
    const dateMatch = matchDate(normText, ctx.availableDates);
    const slotMatch = matchSlot(normText, ctx.slots);

    return {
      raw: rawText,
      normalized: normText,
      intent,
      crop: crop || null,
      centre: centre || null,
      date: dateMatch || null,
      slot: slotMatch === 'AMBIGUOUS' ? null : (slotMatch || null),
      timeAmbiguous: slotMatch === 'AMBIGUOUS',
      // true if nothing at all was understood — caller should ask the
      // farmer to repeat or switch to manual selection
      empty: intent === 'UNKNOWN' && !crop && !centre && !dateMatch && !slotMatch
    };
  }

  global.KSVoiceParser = { parse, normalize };
})(window);
