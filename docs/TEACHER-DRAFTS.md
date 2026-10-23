# Local teacher-note review

Practice plan keeps pasted notes and optional Google Doc bookmarks in this browser. It does not fetch documents, upload notes, use OAuth, or contact a teacher. Text/Docs-JSON file imports are local reads. The original text and each original instruction remain alongside the reviewed cards.

Choose the current Learn instrument, paste notes and select **Review mapping**. Mapping is conservative: repeated instructions remain distinct; unavailable hands, scales, exact speeds, and unsupported commands stay visible as gaps or setup steps. There is no generated score, guessed lesson ID, or replacement with a simpler exercise.

Each card has a title, instrument context, action and suggested minutes. Existing Keys lessons expose their real key/scale/hand; changing these fields selects an exact equivalent if it exists, otherwise the card needs setup. Keys lessons keep their existing saved speed settings. Exercises levels use their own questions and timing. Arbitrary BPM is therefore unavailable for those actions. Structured material uses a saved library score and the central `PracticeMaterial.launchLegacy` adapter, including its supported tempo override. Unknown or approximate rhythm cannot be advertised as a ready Play at Tempo assignment; select Wait for Me. Casual tools open their real destinations without an automated completion timer.

Cards can be added, duplicated, reordered or removed. Changing an action clears unrelated target identifiers so a hidden old lesson cannot launch or collect progress. A structured material target stores its content fingerprint; changed, missing or ambiguous material must be explicitly selected again. The suggested duration is a goal, not a fabricated score length or automatic stop command.

## Saving and recovery

`pp.drafts.v1` stores one draft envelope per student/Learn-instrument pair. Raw source and the optional bookmark save on input, even before Review mapping. Compiled source remains immutable until another review. Changing the raw text after review requires reviewing again before acceptance. Reviewing, editing, accepting and merely opening a tool never award XP.

Saved envelopes include the last observed draft and accepted-plan basis. A stale tab cannot silently overwrite a newer draft or accept over a changed plan. Its candidate stays in memory and can be exported. **Reload saved draft** explicitly replaces that local candidate with the saved copy; export any needed local work first. Storage readback is checked. On failure, retry/export remains available and the planner checkpoint returns an error. A pending text-file read also blocks a successful checkpoint.

**Accept this plan** validates the draft and archives the complete prior accepted plan. It writes the accepted student record last and restores preceding writes if a save fails. Browser storage does not provide a cross-key transaction; an unsuccessful rollback is reported with the affected keys instead of claiming acceptance. Existing students and history are preserved.

Draft limits: 128 KiB text, 32 cards, 128 unsupported assignments, 120-character title, 1–60 suggested minutes, integer 30–280 BPM where supported, valid root pitch class/known scale, and existing bounded target identifiers. Text and titles render as inert escaped content. Per-step IDs change with their musical or action configuration, while stable draft keys retain editing focus and explicit ordering.

## Measured completion

The planner reads the canonical observed-practice ledger for the launched instrument. It writes no XP awards. Keys completion requires a new exact-lesson observation. A selected Exercises level needs a new passing result or answering-time observations in that instrument category; a repeated pass counts even when its previous best score was already perfect. Structured material observations must also intersect saved canonical session IDs in the exact material/fingerprint sidecar. Unrelated Woodshed practice cannot complete a selected material card. Casual references and unresolved setup steps have no automated completion claim.

The public `App.practicePlan` API retains `preview`, `accept`, `state`, `refresh` and `launch`, and adds `draft`, `validateDraft`, `editAccepted`, `editStep`, `addStep`, `duplicateStep`, `removeStep`, `moveStep`, `discardDraft`, `retryDraft`, `reloadDraft`, `exportDraft` and `checkpoint`. Mutation methods return `{ok, errors?, draft?, stepId?}`; invalid edits leave the prior semantic draft unchanged. Export downloads the local raw text, bookmark, draft and save/error state as JSON.

## Verification

Run the existing planner suite and the focused real-browser editor suite against a local HTTP server:

```sh
CHROMIUM=/usr/bin/chromium SL_URL=http://127.0.0.1:4592/index.html node tests/practiceplan.test.js
CHROMIUM=/usr/bin/chromium SL_URL=http://127.0.0.1:4592/index.html node tests/practiceplan-draft.test.js
```

The tests cover immutable source, repeated instructions, real choices, unsupported gaps, editing/order, injection, finite bounds, missing hooks, student/category isolation, reload, failed saves, stale tabs, actual material tempo, canonical progress and 390px layout. Browser MIDI/media requests are stubbed; these are cloud software checks and do not validate hardware.
