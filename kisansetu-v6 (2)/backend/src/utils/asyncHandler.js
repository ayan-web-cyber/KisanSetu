// Express 4 does not catch a rejected promise from an async route handler
// on its own — an unhandled error inside one either hangs the request or
// (via the process-level 'unhandledRejection' safety net in server.js)
// gets logged but never answered. Wrapping every async handler in this
// forwards the error to the global error-handling middleware in server.js,
// which responds with a clean, non-leaking error instead.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
