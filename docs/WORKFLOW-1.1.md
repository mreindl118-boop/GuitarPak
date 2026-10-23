# Instrument workflow

The Practice workspace has four sections: **Learn**, **Free Play**, **Library** and **Progress**. Studio keeps its Timeline, Editor, Song and Ideas tools. The selected instrument is shared with Learn; choosing an instrument or opening a tool earns no practice time or XP.

- **Learn** contains Exercises, Chords, Circle, Plan and Trainer. Lessons retain their own exact instrument and content limits.
- **Free Play** opens the selected instrument’s suitable tool: Piano, Synth, the six-string Guitar neck or Drum pads. Bass, Voice and Other open a clearly labelled overview rather than relabelling a guitar or piano as another instrument. Instrument pills show the related tools; **All tools** retains every Piano, Synth, Pads, Guitar, Tab, Notation, Songs, Jam, MIDI Hub and LUMI practice route.
- **Library** keeps original files and reviewed score revisions. The existing Woodshed remains available for generated exercises, imports and practice. A viewed PDF or unreviewed draft does not become a graded lesson automatically.
- **Progress** uses the existing canonical instrument ledger and progress component. Its instrument selector updates the same category used by Learn and Free Play. Earlier unassigned data stays separate.

Practice starts from a lesson or a chosen/generated score. There is no second generic Play or Practice hub duplicating these choices. Saved page IDs and plugin routes still work, and Back returns through visited routes.

The header’s **Tuner** opens one sheet over any page, including Studio and Settings. The old `App.switchTo('tuner')` route opens that sheet and keeps the underlying page active. Opening it does not start audio capture; use its explicit Start control. Escape, Back, its close button or a tap outside dismisses it and restores focus. Settings, the musical-context clef and Tuner remain adjacent. Narrow phones give the tool row its own space so controls remain reachable without hiding utilities.

The clef remains the single key, scale, Scale Lock, LUMI Display and pitch-color context. A modal sheet blocks background context controls. Storage warnings use the real shared persistence facade and link to Storage settings; an unsaved overlay is never proof of a durable canonical progress write. The Settings archive and Music Library archive retain their distinct scopes.

An interrupted import is recovered before the app opens. If restored data needs a fresh load, the recovery card keeps the app blocked and offers **Reload to open restored data**. Until that deliberate reload, previously loaded history/preferences are not used to start the app and no new service worker is registered. A failed recovery retains its diagnostic export and Retry control.

Run `tests/run.sh nav context-global workflow tuner-sheet` plus the library, score-review, persistence and full regression suites. Browser tests verify navigation, actual registered modules, shared state, modal focus, narrow layouts and no automatic permission request. Physical tuning accuracy, native capture/routing and hardware LED behavior require separate device validation.
