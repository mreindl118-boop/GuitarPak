/* Settings tab — app-wide preferences. Feature-specific options stay with
 * their feature (e.g. the fretboard's degree colors live in its gear panel);
 * this tab holds everything app-level, starting with appearance. */
(function () {
  'use strict';

  function init(rootEl) {
    App.injectCSS('settings',
      '.set-theme-note{margin-top:10px}'
    );

    rootEl.innerHTML =
      '<div class="card">' +
        '<h2>Appearance</h2>' +
        '<div class="fb-field">Theme' +
          '<div class="seg" id="set-theme">' +
            '<button type="button" data-theme-pref="dark">Dark</button>' +
            '<button type="button" data-theme-pref="light">Light</button>' +
            '<button type="button" data-theme-pref="auto">Auto</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">Auto follows your device&rsquo;s light/dark setting and switches live when it changes.</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Sound</h2>' +
        '<div class="fb-field">Note sound' +
          '<div class="seg" id="set-tone">' +
            '<button type="button" data-tone="steel">Steel</button>' +
            '<button type="button" data-tone="electric">Electric</button>' +
            '<button type="button" data-tone="nylon">Nylon</button>' +
            '<button type="button" data-tone="synth">Synth</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">The voice for fretboard taps, scale practice, chord strums and trainer notes.</div>' +
        '<div class="fb-field" style="margin-top:14px">Bass guitar' +
          '<div class="seg" id="set-bass">' +
            '<button type="button" data-bass-style="finger">Fingered</button>' +
            '<button type="button" data-bass-style="pick">Picked</button>' +
          '</div>' +
        '</div>' +
        '<div class="muted small set-theme-note">How the Jam backing-track bass plays &mdash; warm finger-plucked or bright picked. Takes effect on the next bass note.</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>About</h2>' +
        '<div class="muted small">GuitarLab v' + App.version + ' &mdash; updates are checked automatically at startup.</div>' +
      '</div>';

    var seg = document.getElementById('set-theme');

    function paint() {
      var pref = App.themePref;
      seg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-theme-pref') === pref);
      });
    }

    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-theme-pref]');
      if (!b) return;
      App.setTheme(b.getAttribute('data-theme-pref'));
      paint();
    });

    paint();

    var toneSeg = document.getElementById('set-tone');

    function paintTone() {
      var tone = App.pluckTone;
      toneSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tone') === tone);
      });
    }

    toneSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tone]');
      if (!b) return;
      App.setPluckTone(b.getAttribute('data-tone'));
      paintTone();
    });

    paintTone();

    var bassSeg = document.getElementById('set-bass');

    function paintBass() {
      var style = App.store.get('app.bassStyle', 'finger');
      if (style !== 'pick') style = 'finger';
      bassSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-bass-style') === style);
      });
    }

    bassSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-bass-style]');
      if (!b) return;
      App.store.set('app.bassStyle', b.getAttribute('data-bass-style'));
      paintBass();
    });

    paintBass();
  }

  App.register('settings', { init: init });
})();
