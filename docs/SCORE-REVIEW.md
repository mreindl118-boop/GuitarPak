# Local score review

Open **Library → Review** or choose **Review targets** for a local library item.
Load a PDF, supported image or MusicXML file, or reopen an existing local source.
The library retains the original bytes and SHA-256 separately from every target
revision. File loading, viewing and editing do not award practice time or XP.

PDF pages render locally with pinned PDF.js. Use previous/next page and fit/zoom;
the source stays beside the editable target table on a wide screen and above it
on a phone. A PDF being visible does **not** mean notes have been recognized.
Automatic PDF/image music recognition is not implemented. General browser OMR
quality and model distribution remain unresolved; see the cloud research report
`soundlab-evidence/1.1-pdf-omr-research.md` outside the source repository.

Enter pitches with octaves (`C4`, `F#4`, `Bb3`), explicit `MIDI:0`–`MIDI:127`,
spaces or commas for a chord, and `R` for a rest. Beats start at zero. Each target has a beat, duration, named part,
source page and explicit Checked state. Exercise length includes trailing rests.
Edit part labels and instrument mappings separately from the **Practice credit
category**, which identifies the instrument you actually practice. Choose the
parts to practice explicitly; unselected parts remain in the saved revision.
Instrument labels do not create independent MIDI output routes.

Save a draft at any point. Check targets against the original, mark each Checked
(or deliberately choose **I checked all targets**), then **Save reviewed
revision**. Review appends a new immutable revision and leaves earlier drafts
intact. Changing a target clears its check and blocks launch until reviewed
again. The saved-revision selector reopens earlier revisions without overwriting
them. Source bytes remain unchanged by every target edit.

If original rhythm is unknown, leave the rhythm confirmation unchecked. The
result is a manually ordered **Wait for Me** exercise, with no claim of original
rhythm or hold timing. The review UI disables Tempo and the shared performance
launcher/engine enforce Wait even if a caller forces a Tempo request. Confirm
beat positions and durations only when you have checked them against the source.
Save named sections against a reviewed revision, then launch through the existing
PerformancePlayer. Score review has no audio player or MIDI writer of its own.

Supported MusicXML and MIDI create editable targets from explicit pitches and durations.
Its complete parsed notation, written spellings, tie segments, measures, key and
tempo changes remain alongside the derivative. Tied sounding notes are merged;
the selected constant practice tempo is disclosed when the original has changes.
The untouched source remains the authority for lyrics, expression and layout.
Unsupported notation fails explicitly and leaves the original available for
export or manual target entry. MIDI uses the current strict Woodshed SMF decoder,
retains its original decoded source/warnings, velocity and channel, and labels
extreme pitches numerically when outside the notation subset. Zero-duration MIDI
notes remain onset-only; no held duration is invented. MIDI pitch spelling is an
editor display choice, not recovered notation. Compressed MXL originals remain
stored but are not decoded by this module.

Storage failures leave unsaved edits in memory and display an error. Before
import/update/reload, `App.checkpoint()` invokes this editor's checkpoint: pending
loads/saves block a false safe result, and a dirty draft must save successfully.
Keep the tab open and retry if saving fails. A browser-origin/library backup is
separate from Settings; exporting only Settings does not include source files.

## Developer contract

`SLScoreReview.module` self-registers page `score`. Public APIs are
`configure({library?,onLaunch?})`, `mount(container)`, `open(itemId,revisionId?)`,
`saveDraft()`, `review()`, `launch()`, `checkpoint()`, `snapshot()` and `dispose()`.
`open(itemId,null)` deliberately starts a new draft from the original; omitted
revision ID selects the latest saved revision. `library:review` accepts
`{itemId,revisionId?}` and opens the shared page. Snapshots are detached copies.

`checkpoint()` returns a promise of `{ok,errors?}`. It never treats an unfinished
load/render/save as persisted. It saves the exact editor, including source-only
draft metadata. No reviewed status is granted by checkpointing.

Revisions contain optional original `notation`, an `editor` snapshot, explicit
`rhythmKnown`/`parts`/source anchors and a practice `score`. Score notes use
`{id,m,t,d,v,pitch,partId,sourceAnchor}`; rest rows use `{rest:true,t,d}`. `len`
preserves final beat space. Unknown-rhythm derivatives set `rhythmKnown:false`
and capabilities `{wait:true,tempo:false,holdScoring:false}`. The editor retains
`selectedPartIds`; selecting a part changes the practice selection, never the
original file.

`onLaunch(payload)` receives `{itemId,revisionId,revision,score,rhythmKnown,
selectedPartIds,section,mapping,instrument,mode}` and must resolve `{ok:true}` or
`{ok:false,error}`. Failures remain visible and leave the saved revision intact.
The shared `PracticeMaterial` seam independently reloads and validates the saved
reviewed revision, filters selected part IDs and enforces unknown-rhythm limits.
Do not trust the callback's snapshot as a substitute for fresh library identity.

PDF.js 6.4.299 is vendored in `vendor/pdfjs`. Its official npm tarball was verified
against the registry SHA-512 integrity value. `manifest.json` records provenance,
individual SHA-256 hashes and byte sizes. Preserve Apache-2.0 and the support
asset notices. The display module, exact matching worker, CMaps, standard fonts
and WASM assets must be served/cached together. No CDN or OMR model is fetched.
Only the current visible page is rendered, capped at 12 million canvas pixels;
the viewer bounds page count to 500. Library file/capacity bounds apply first.
These bounds do not establish native/mobile device performance.

Run `tests/run.sh score score-review` with the local HTTP runner and Chromium.
Fixtures are authored test material. Tests cover pure strict notation/XML/MIDI
roundtrips, actual local PDF rendering, real IndexedDB revisions, exact source
bytes, review/launch limits, checkpoint failures, part selection and phone layout.
Cloud checks do not verify physical MIDI, LUMI colors or audible hardware output.
