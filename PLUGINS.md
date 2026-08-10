# soundLAB plugins

soundLAB can be extended with plain JavaScript plugins — no build step, no
tooling. A plugin is a single `.js` file loaded from **Settings › Plugins**.
Its code runs right after the app boots (and again on every launch while
enabled), with the `SoundLab` API in scope.

> **Trust warning:** plugins run with the same power as the app itself, on
> your device. Only load code you wrote or trust. Plugins are stored locally
> (in the app's storage) and never leave your device.

A complete working example ships in this repo: [`plugins/sample-lofi.js`](plugins/sample-lofi.js)
— it adds a "Lo-fi" FX and a "Glass bell" synth voice. Load it from Settings
to try the pipeline, then copy it as your starting point.

## The API (`window.SoundLab`, apiVersion 1)

| Member | What it does |
| --- | --- |
| `SoundLab.registerPage(id, label, space, module)` | Add a whole page. `space` is `'practice'` or `'studio'`; `module` is `{init(rootEl), onShow?, onHide?, onKey?}` — the same contract every built-in page uses. It appears in that workspace's page menu immediately. |
| `SoundLab.registerFx(id, {name, build(ctx, fx)})` | Add a Studio FX type. It appears in every track's FX picker. `build` gets a `BaseAudioContext` (live **or** offline render!) and `{type, mix: 0..1}`; return `{input, output, dispose()}` AudioNodes. |
| `SoundLab.registerSynthPreset({id, name, params})` | Add a synth voice to the Tracks editor. Start from `SoundLab.daw.defaultSynth()` and tweak (oscillators, envelopes, filter, unison, glide, LFO). |
| `SoundLab.on(event, fn)` / `SoundLab.emit(event, data)` | The app-wide event bus: `tempo`, `fb:scale`, `jam:chord`, `midi:note`, `note:input`, `st:step`, `space`… |
| `SoundLab.app` | The application shell (`App`): `store.get/set`, `getAudio()`, `pluck()`, `switchTo()`, `icon()`, `injectCSS()`… |
| `SoundLab.daw` | The Studio engine (`DAW`): `engine` (tracks/loop/render), `createSynth`, `createSampler`, `createDrums`, `samples`… |
| `SoundLab.theory` | The music-theory core (`Theory`): scales, chords, diatonic harmony, note names. |

## Minimal examples

An FX:

```js
SoundLab.registerFx('telephone', {
  name: 'Telephone',
  build: function (ctx, fx) {
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 4;
    return { input: bp, output: bp, dispose: function () { bp.disconnect(); } };
  }
});
```

A page:

```js
SoundLab.registerPage('hello', 'Hello', 'practice', {
  init: function (root) {
    root.innerHTML = '<div class="card"><h2>Hello</h2>' +
      '<div class="muted">Key right now: <b id="hello-key"></b></div></div>';
    function paint() {
      var pc = SoundLab.app.store.get('fb.root', 9);
      document.getElementById('hello-key').textContent =
        SoundLab.theory.pcName(pc, SoundLab.theory.FLAT_KEYS.has(pc));
    }
    SoundLab.on('fb:scale', paint);
    SoundLab.on('fb:set', paint);
    paint();
  }
});
```

## Ground rules

- Use the shared `SoundLab.app.getAudio()` context — never create your own
  `AudioContext`, and connect to `ctx.destination` (the master volume slider
  will govern you for free).
- Prefix your DOM ids/classes and store keys to avoid collisions.
- FX `build` must work on an `OfflineAudioContext` too (no timers, no DOM in
  the audio path) or your effect will be missing from WAV exports.
- Keep files under 100 KB; heavy assets aren't supported yet.
- The API is versioned (`SoundLab.apiVersion`). Additions will keep v1
  working; breaking changes will bump it.
