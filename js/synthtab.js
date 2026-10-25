/* soundLAB SYNTH TAB (1.3) — the Synth Deck as its own top-level group:
 *   deck     the deck's play face (step 1: the MIDI Hub's Control view,
 *            borrowed while this page is open — one DOM, like the Keys page's
 *            'synth' pill borrows the piano)
 *   liveset  Live sets: pages of 16 presets (built in a later step)
 *   midihub  the MIDI Hub as it is (pill "Hub")
 * Plan: docs/SYNTH-TAB-PLAN.md. The Hub keeps owning the deck's DOM, ports
 * and output (js/midihub.js + js/synthdeck.js); this file only moves the
 * Control view between the two panels and mirrors the Hub's page hooks
 * (app-sound mute while a synth page is open, deck stop on leave).
 */
(function () {
  'use strict';

  var deckRoot = null, liveRoot = null;
  var borrowed = null, home = null, homeNext = null; // the Hub's Control view + where it came from

  function hub() { return document.getElementById('panel-midihub'); }
  function controlView() { var h = hub(); return h ? h.querySelector('.mh-view[data-view="control"]') : null; }
  function midi() { return App.midi; }

  // the Hub mutes the app's own voice while it is open (a synth plays itself)
  // unless the user asked to hear the app too — same rule here
  function applyMute(on) {
    if (!midi() || !midi().mute) return;
    midi().mute('synthtab', on && App.store.get('midihub.hear', false) !== true);
  }

  function borrow() {
    var v = controlView();
    if (!v || borrowed) return;
    home = v.parentNode; homeNext = v.nextSibling;
    deckRoot.appendChild(v);
    v.hidden = false;
    borrowed = v;
  }
  function giveBack() {
    if (!borrowed) return;
    var v = borrowed; borrowed = null;
    if (home) home.insertBefore(v, homeNext && homeNext.parentNode === home ? homeNext : null);
    v.hidden = App.store.get('midihub.view', 'control') !== 'control';
    home = homeNext = null;
  }

  App.register('deck', {
    init: function (el) {
      deckRoot = el;
      App.injectCSS('synthtab',
        '#panel-deck .mh-view[data-view=control]{display:block}' +
        '.st-intro{margin:0 0 12px}.st-intro h2{margin:0 0 4px}' +
        '.st-soon{display:grid;gap:10px}.st-soon ul{margin:0;padding-left:18px}');
      el.innerHTML = '<div class="st-intro"><h2>Synth deck</h2><p class="muted small">Your synth, on this screen: the sound you are on, knobs, buttons, your sounds. Ports and the technical views are under Hub.</p></div>';
    },
    onShow: function () {
      borrow();
      applyMute(true);
      var m = midi();
      if (m && m.supported && !m.ready && App.store.get('midi.wanted', false)) m.enable().catch(function () { });
      if (App.synthDeck && App.synthDeck.onShow) { try { App.synthDeck.onShow(); } catch (e) { /* the deck repaints itself */ } }
    },
    onHide: function () {
      if (App.synthDeck && App.synthDeck.stop) App.synthDeck.stop();
      applyMute(false);
      giveBack();
    },
    onBack: function () { return !!(App.synthDeck && App.synthDeck.onBack && App.synthDeck.onBack()); }
  });

  App.register('liveset', {
    init: function (el) {
      liveRoot = el;
      el.innerHTML =
        '<div class="card st-soon">' +
          '<h2>Live sets</h2>' +
          '<p class="muted">Your presets in pages of 16, like the synth’s own Live Sets: pick a set, step through its slots with a foot switch, every slot brings back the sound, the knobs, the scene and the split.</p>' +
          '<ul class="muted small"><li>Save a preset from the Deck (Save preset).</li><li>Name a set, drop presets on its slots.</li><li>Go live: only the grid, the sound and your four knobs.</li></ul>' +
          '<p class="muted small">Being built (docs/SYNTH-TAB-PLAN.md, step 5).</p>' +
        '</div>';
    },
    onShow: function () { applyMute(true); },
    onHide: function () { applyMute(false); }
  });

  window.SLSynthTab = { borrowed: function () { return !!borrowed; } }; // test hook
})();
