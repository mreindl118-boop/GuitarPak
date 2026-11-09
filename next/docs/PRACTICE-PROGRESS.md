# Instrument progress and consistency XP

Open **Practice → Woodshed → Progress**. Choose Piano, Synth, Guitar, Bass,
Drums, Voice or Other. Choose the same explicit instrument in the guided
player before starting. Instrument identities do not depend on a connected
device name, and one instrument never earns or loses another's XP.

Lifetime earned XP is the sum of recorded awards: it is never decayed or
recalculated when settings change. **Current consistency XP** and its level
can fall after missed days. This is an adjustable consistency mechanic, not
a measurement of skill loss. Session observations, achievements and existing
legacy Woodshed history are not removed or migrated.

## Defaults and controls

Settings are shared rules for the separate instrument ledgers. The panel
validates them atomically; invalid changes leave prior settings intact.

| Parameter | Default |
| --- | --- |
| Qualifying daily engagement | 10 minutes, cumulative per instrument/day |
| XP per engaged minute | 2 |
| XP per correctly matched note | 0; optional, capped at 100 per session |
| Streak bonus | 5% per qualifying streak day, maximum 25% |
| Missed-day grace | 3 closed missed days |
| Consistency decay | Enabled; 2% per eligible missed day, maximum 20 XP/day |
| Consistency floor | 0 XP |
| Level interval | 100 current XP |
| Calendar | Explicit IANA time zone, initially the browser's zone |

All these parameters are editable, including disabling decay. Changing rules
settles the old calendar first and applies future rules without rewriting
awards. Repeated loads cannot apply a day's decay twice. Clock rollback does
not repeat decay. Turning decay back on does not charge disabled days.

Inclusive vacation dates protect consistency and preserve a qualifying streak
across those dates, without inventing practice minutes or earned streak days.
Already settled vacation protection survives clearing future plans. A daily
goal must actually be met; merely opening the app does not qualify a day.

## What is measured

The guided player records completed and deliberately stopped/restarted runs.
Engagement counts only small active-clock intervals near a fresh raw attack;
count-in, pause, large background jumps and idle waits do not earn time. A
session without engagement earns no XP. Note rewards also require at least
one measured second. Every run has one ID, so completion/Stop/retry cannot
credit it twice. A paused run keeps its identity.

Seven-, thirty- and ninety-day charts have accessible text and table views.
They show actual engaged minutes, raw note accuracy, measured timing and
observed/completed tempo. Raw accuracy pools `matched / (expected + extra)`;
wrong notes are a subset of extras. Partial results retain their original
expected denominator. Wait for Me has no timing or achieved-tempo observation.
Tempo is recorded only during measured timed engagement; it is not proof of
mastery. Empty dates and unavailable measurements stay explicitly unknown.

Measured time segments carry local day labels, including a tick crossing
midnight. Note/timing observations belong to the session-end day. Older
records without segments explicitly use session-end time allocation; no
historical daily distribution is invented. Changing time zones preserves
recorded labels and awards; only future allocation follows the new zone.

## Storage and recovery

Data stays in browser local storage under the new versioned progress key.
The panel exports JSON without clearing anything. No reset or import button
silently replaces history. Invalid persisted data is refused with an error;
it is not erased. If saving a player result fails, the player shows a warning
with explicit retry and unsaved-session export. Export before closing if
storage cannot be restored; an unsaved in-memory result cannot survive closing
the browser. Clearing browser site data remains outside app persistence.

`practice-progress` tests calendar/DST/midnight, gaps, grace, vacation,
settings, duplicates, storage failures and validation deterministically.
`practice-progress-ui` and `performance-progress` exercise real player and
history flows with simulated clocks. No historical or physical performance
measurements are fabricated by these cloud tests.
