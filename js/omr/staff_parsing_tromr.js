/* soundLAB OMR: port of homr/staff_parsing_tromr.py (AGPL-3.0, github.com/liebharc/homr).
   One staff image through TrOMR; a staff that is not part of a grand staff keeps only the
   symbols of the upper staff (or without a position).

   Async boundary: parseStaffTromr / predictBest return Promises. Like Python's module global,
   the Staff2Score is created once per worker on first use (both sessions) and kept. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const V = OMR.transformer_vocabulary;

  let inference = null; // Staff2Score, or a Promise of one while it is being created
  let createOpts = {};  // Staff2Score.create options (progress callbacks, encoder/decoder sessions)

  // homr: staff_parsing_tromr.py:10
  async function parseStaffTromr(staff, staffImage, config) {
    return predictBest(staffImage, staff, config);
  }

  // homr: staff_parsing_tromr.py:14
  async function predictBest(orgImage, staff, config) {
    if (inference === null) {
      inference = OMR.transformer_staff2score.Staff2Score.create(config, createOpts);
      inference.catch(() => { inference = null; }); // a failed creation is retried next time (Python's stays None)
    }
    const inf = await inference;
    inference = inf;

    const result = await inf.predict(orgImage);
    if (staff.isGrandstaff) return result;
    return result.filter((r) => V.isUpperOrHasNoPosition(r.position));
  }

  OMR.staff_parsing_tromr = {
    parseStaffTromr: parseStaffTromr, predictBest: predictBest,
    // JS only: the module global (an object with predict(image) -> symbols | Promise), e.g. a stub
    // or a Staff2Score made with other models; null drops it (the next call creates one)
    _setInference: function (x) { inference = x; },
    _getInference: function () { return inference; },
    // JS only: options for the Staff2Score the next predictBest creates
    configure: function (opts) { createOpts = opts || {}; }
  };
})(typeof self !== 'undefined' ? self : globalThis);
