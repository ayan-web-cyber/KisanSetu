/* =========================================================
   KisanSetu — Voice Booking: browser speech recognition wrapper
   -----------------------------------------------------------
   Thin wrapper around the browser's native SpeechRecognition /
   webkitSpeechRecognition API. Deliberately does NOT talk to any
   booking logic, the API, or app state directly — it only turns
   microphone audio into text and reports it back through callbacks.
   voiceCommandParser.js turns that text into an intent, and
   script.js decides what to do with the intent. Keeping this file
   free of business logic means the same wrapper works no matter
   how the booking flow changes.

   No external speech-to-text service is used — everything runs
   on-device via the browser, per the "don't introduce a heavy
   external service" requirement. If the browser doesn't support
   SpeechRecognition at all (most non-Chromium browsers), isSupported()
   returns false and callers should fall back to manual booking.
   ========================================================= */
(function(global){
  const SpeechRecognitionImpl = global.SpeechRecognition || global.webkitSpeechRecognition || null;

  // Auto-stop a single listening session after this long even if the
  // browser never fires its own 'end'/'speechend' event — required by
  // spec ("stop listening after a reasonable timeout") and protects
  // against a stuck "Listening…" UI on flaky mobile browsers.
  const AUTO_STOP_MS = 12000;

  let recognizer = null;
  let watchdog = null;
  let active = false;

  function isSupported(){
    return !!SpeechRecognitionImpl;
  }

  function clearWatchdog(){
    if(watchdog){ clearTimeout(watchdog); watchdog = null; }
  }

  // opts: { lang, onStart, onInterim(text), onFinal(text), onError(reason), onEnd }
  function start(opts){
    opts = opts || {};
    if(!isSupported()){
      if(opts.onError) opts.onError('unsupported');
      return;
    }
    // Only one listening session at a time — starting a new one always
    // tears down whatever was running first, so the caller never has to
    // worry about overlapping sessions.
    stop();

    recognizer = new SpeechRecognitionImpl();
    recognizer.lang = opts.lang || 'en-IN';
    recognizer.continuous = false;     // one utterance per session — caller restarts for multi-turn
    recognizer.interimResults = true;  // let the UI show partial text while the farmer is still speaking
    recognizer.maxAlternatives = 1;

    active = true;

    recognizer.onstart = function(){
      if(opts.onStart) opts.onStart();
      clearWatchdog();
      watchdog = setTimeout(function(){
        if(active) stop(); // reasonable-timeout safety net
      }, AUTO_STOP_MS);
    };

    recognizer.onresult = function(event){
      let interim = '', finalText = '';
      for(let i = event.resultIndex; i < event.results.length; i++){
        const res = event.results[i];
        if(res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      if(interim && opts.onInterim) opts.onInterim(interim);
      if(finalText && opts.onFinal) opts.onFinal(finalText.trim());
    };

    recognizer.onerror = function(event){
      // Map the browser's error codes to a small farmer-facing vocabulary —
      // script.js turns these into plain-language messages, never raw codes.
      const reason = event && event.error ? event.error : 'unknown';
      if(opts.onError) opts.onError(reason);
    };

    recognizer.onend = function(){
      clearWatchdog();
      active = false;
      if(opts.onEnd) opts.onEnd();
    };

    try{
      recognizer.start();
    }catch(err){
      // start() throws if called in an invalid state (e.g. rapid double-tap)
      active = false;
      if(opts.onError) opts.onError('start-failed');
    }
  }

  function stop(){
    clearWatchdog();
    if(recognizer){
      try{ recognizer.stop(); }catch(err){ /* already stopped */ }
    }
    active = false;
  }

  function isListening(){
    return active;
  }

  global.KSVoiceRecognition = { isSupported, start, stop, isListening };
})(window);
