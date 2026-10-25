/* soundLAB: the Helix Stadium plugin is BUILT IN since 0.82.0 - open
 * Guitar › Helix (js/helix.js; docs/HELIX-STADIUM.md). It outgrew the 100 KB
 * plugin cap. This stub keeps old links working: loading it does nothing on
 * 0.82.0 and later, and on an older app it says to update. (A stored copy of
 * the full old plugin is skipped by js/plugins.js, not run.)
 */
(function () {
  if (window.SLHelix && window.SLHelix.builtIn) return;
  throw new Error('Helix Stadium is built into soundLAB 0.82.0 and later: update the app, then open Guitar › Helix.');
})();
