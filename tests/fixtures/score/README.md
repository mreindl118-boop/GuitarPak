# Score fixtures

`tempo-tie-chord.musicxml`, `multiple-voices.musicxml` and `repeat.musicxml` are
small authored SoundLab test fixtures recovered unchanged from
`b8ccb55de28e4dd297e8d4b7ac4f8a4b3dfcfe4f:tests/fixtures/score/`.

`original-study.pdf` is a newly authored two-page cloud test document using
original text and simple vector staff/target marks. It is a viewer fixture, not
an OMR accuracy corpus or a user score.

`original-onset-range.mid` is a newly authored SMF format-0/480-PPQ fixture. It
contains channel-2 pitches 0 and 127 at beats 0 and 1, velocities 79 and 100,
immediate zero-duration releases, and an end marker at beat 2. It verifies exact
onset-only retention without invented holds or pitch-range folding.

No fixture contains a private score, performance recording, or purchased score.
