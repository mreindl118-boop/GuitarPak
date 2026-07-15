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
  }

  App.register('settings', { init: init });
})();
