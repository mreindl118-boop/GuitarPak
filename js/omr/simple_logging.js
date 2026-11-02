/* soundLAB OMR: port of homr/simple_logging.py (AGPL-3.0, github.com/liebharc/homr). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  // homr: simple_logging.py:5
  // A logger with different log levels felt overkill for this project, so there is one logger
  // that logs to stderr. In the browser there is no stderr: messages go to
  // OMR.simple_logging.sink(message) when it is set (the worker forwards them as progress
  // notes), else nowhere. Arguments are joined with spaces like Python's print().
  function eprint() {
    var sink = OMR.simple_logging.sink;
    if (typeof sink !== 'function') return;
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts.push(String(arguments[i]));
    sink(parts.join(' '));
  }

  OMR.simple_logging = { eprint: eprint, sink: null };
})(typeof self !== 'undefined' ? self : globalThis);
