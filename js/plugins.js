/* soundLAB plugin runtime — window.SoundLab, the public API for advanced
 * workflows. Documented in PLUGINS.md; a working example lives at
 * plugins/sample-lofi.js in the repo.
 *
 * A plugin is a plain .js file loaded from Settings › Plugins. Its code runs
 * with SoundLab in scope right after the app boots (and on every later
 * launch, in order, while enabled). Plugins can:
 *   SoundLab.registerPage(id, label, space, module)  add a whole page
 *   SoundLab.registerFx(id, {name, build})           add a Studio FX type
 *   SoundLab.registerSynthPreset(preset)             add a synth voice
 *   SoundLab.on / emit                               ride the event bus
 *   SoundLab.app / daw / theory                      full access to the guts
 *
 * Plugins run with the same power as the app itself — Settings says so too:
 * only load code you trust. Code is stored locally (guitarlab plugins.list),
 * capped at 100 KB per plugin, errors are caught per-plugin and surfaced in
 * Settings without breaking the app.
 */
(function () {
  'use strict';

  var MAX_CODE = 100 * 1024;

  function list() {
    var v = App.store.get('plugins.list', []);
    return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
  }

  function save(l) { App.store.set('plugins.list', l); }

  function runOne(p) {
    try {
      /* eslint-disable no-new-func */
      var fn = new Function('SoundLab', 'App', 'DAW', 'Theory', p.code);
      fn(window.SoundLab, window.App, window.DAW, window.Theory);
      p.error = '';
      return true;
    } catch (e) {
      p.error = String(e && e.message || e);
      console.error('plugin "' + p.name + '"', e);
      return false;
    }
  }

  function runStored() {
    var l = list();
    var dirty = false;
    l.forEach(function (p) {
      if (p.on === false) return;
      var hadErr = p.error;
      runOne(p);
      if (p.error !== hadErr) dirty = true;
    });
    if (dirty) save(l);
  }

  window.SoundLab = {
    apiVersion: 1,
    get app() { return window.App; },
    get daw() { return window.DAW; },
    get theory() { return window.Theory; },
    on: function (evt, fn) { return App.on(evt, fn); },
    emit: function (evt, data) { return App.emit(evt, data); },

    registerPage: function (id, label, space, module) {
      return App.addPage(id, label, space, module);
    },

    registerFx: function (id, def) {
      if (!window.DAW || !id || !def || typeof def.build !== 'function') return false;
      DAW.fxPlugins[id] = def;
      return true;
    },

    registerSynthPreset: function (preset) {
      if (!window.DAW || !preset || !preset.id || !preset.params) return false;
      for (var i = 0; i < DAW.SYNTH_PRESETS.length; i++) {
        if (DAW.SYNTH_PRESETS[i].id === preset.id) return false;
      }
      DAW.SYNTH_PRESETS.push(preset);
      return true;
    },

    plugins: {
      get list() { return list(); },
      add: function (name, code) {
        if (!code || code.length > MAX_CODE) return { ok: false, error: 'plugin too large (100 KB max)' };
        var l = list();
        var p = {
          id: 'p' + Date.now().toString(36),
          name: String(name || 'plugin').slice(0, 40),
          code: String(code),
          on: true,
          error: ''
        };
        var ok = runOne(p); // run immediately so it works without a reload
        l.push(p);
        save(l);
        return { ok: ok, error: p.error, id: p.id };
      },
      toggle: function (id, on) {
        var l = list();
        l.forEach(function (p) { if (p.id === id) p.on = !!on; });
        save(l);
        // enabling takes effect now; disabling on next launch (code already ran)
        if (on) l.forEach(function (p) { if (p.id === id) runOne(p); });
        save(l);
      },
      remove: function (id) {
        save(list().filter(function (p) { return p.id !== id; }));
      }
    }
  };

  // the shell boots synchronously after all scripts load — run stored
  // plugins right after, so registered pages/FX land on a booted app
  setTimeout(runStored, 0);
})();
