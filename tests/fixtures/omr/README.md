# Original OMR test pixels

These PNGs are original CC0-1.0 test compositions generated for SoundLab, engraved with Verovio 6.3.0 and rasterized with CairoSVG. The engraving tool is not shipped here. No purchased, private or copyrighted repertoire was added.

- `01-treble-quarters-clean.png`: C4 D4 E4 F4, four quarter notes.
- `02-treble-rhythm-clean.png`: C4 quarter, E4 eighth, G4 eighth, A4 half.
- `03-bass-quarters-clean.png`: C3 D3 E3 F3, four quarter notes.
- `04-bass-rhythm-clean.png`: C3 half, G2 quarter, A2 quarter.
- `12-treble-chords-clean.png`: authored simultaneous chords outside the model's single-voice scope. The current model emits ambiguous tokens; the parser retains unsupported evidence instead of inventing chord notes.
- `14-repeat-bars-clean.png`: authored melody with repeat navigation outside the model's playback scope. The current model can omit the repeat sign while producing plausible notes; scope warnings and review remain mandatory.
- `17-page-treble-quarters-scan.png`: eight authored measures of treble quarter-note melody, with controlled mild synthetic degradation and skew; used for actual detector/rectification/model/source-box integration.

Tests give the recognizer only decoded image pixels. Expected pitches are used after inference for assertions. Actual model rhythm errors are preserved and disclosed; these fixtures do not establish general OMR accuracy.
