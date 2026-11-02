# The symbol language (js/omr): tokens, keys, triplets, MusicXML

Ported from homr: `transformer/vocabulary.py`, `transformer/configs.py`, `circle_of_fifths.py`,
`triplet_restoration.py` and `music_xml_generator.py`. Load order (manifest): `np.js` …
`transformer_vocabulary.js`, `transformer_configs.js`, `circle_of_fifths.js`,
`triplet_restoration.js`, `music_xml_generator.js`. They need only `np.js` (OMR.py) at load time.
At call time they look up `OMR.simple_logging.eprint` (optional) and `OMR.constants.durationOfQuarter`
(`ConversionState`, so generate_xml needs constants.js loaded).

Suites: `tests/omr-vocab.test.js` (502 checks), `tests/omr-xml.test.js` (52 checks; both incl. the audit regressions). Both load only
the language files (not the whole manifest), so a broken unrelated engine file does not stop them.
Fixtures: `tools/omr/dump_lang.py` (see its docstring) writes `$OMR/fixtures/<page>/12-lang-{voices,calls,xml}.json`,
`12-lang-ship-*.json` (with `--ship`), `$OMR/fixtures/12-lang-synthetic.json` and, with `--audit` (no models,
no pages, 3 s), `$OMR/fixtures/12-lang-audit.json`: the adversarial audit's regression cases (exotic tuplets whose
sums pass 2^53 in comparisons, imgpos NaN/inf/huge, str.strip whitespace, kern bases > 2^31, KeyError messages,
Fraction ops on big sums) plus 160 random + 60 triplet-heavy voices through _clean_up_voice and generate_xml.

Result: exact parity everywhere, on all 7 pages and every synthetic case (no tolerances needed: all
values are strings, ints and exact Fractions; image coordinates are carried as the same doubles).

## Exports

`OMR.transformer_vocabulary`
- constants `nonote` ('.'), `empty` ('_'), `VALID_TIME_SIGNATURE_DENOMINATORS`, `DYNAMICS`, `DYNAMICS_MODIFIER`
- `buildDict, buildRhythm, buildLift, buildPosition, buildArticulation, buildSlur, buildPitch, Vocabulary`
- `isLowerPosition, isUpperOrHasNoPosition, hasRhythmSymbolAPosition, _splitArticulations`
- `SymbolDuration, priorPowerOfTwo, kernToSymbolDuration, EncodedSymbol`
- `removeDuplicatedSymbols(symbols, cleanupTuplets = true)` and its helpers `_groupIntoChords,
  _fixOverEagerTuplets, _groupIntoMeasures, _flattenMeasures, _getDurationOfMeasure,
  _getTypicalDurationOfMeasures, _removeTuplets, _onlyKeepLowerStaffIfThereIsAClef,
  _removeDuplicatedPiches, _removeRedudantClefsKeysAndTimeSignatures, _flattenChords`
- `sortTokenChords(symbols, keepChordSymbol = false)`
- JS only: `sortSymbols(list)` (= Python `sorted(list_of_symbols)`), `invert(dict)` (index -> token array
  for detokenize), `Fraction` (same class as `OMR.fractions.Fraction`)

`OMR.fractions.Fraction` (defined in transformer_vocabulary.js, only if OMR.fractions is not set yet):
Python's `fractions.Fraction` on safe JS integers. `new Fraction(n, d=1)` normalises (sign on the
numerator, reduced, no -0); `add sub mul div` (accept ints), `neg abs`, `cmp eq ne lt le gt ge`,
`int()` (truncates like `int(f)`), `toString()` = `str(f)` ('3/4', '2'), `toNumber()`.
Statics `Fraction.from(x)`, `Fraction.max(list)`, `Fraction.min(list)` (first extreme wins),
`Fraction.sorted(list)`. numerator/denominator are stored as JS numbers; add/mul/cmp switch to BigInt
whenever an intermediate product leaves 2^53 (ONE measure of note_11.. note_13.. note_34.. note_96..
note_128.. sums to a denominator of ~4e8 and comparing two sums multiplies to ~1e17: before the audit
that threw OverflowError where Python works). Only a REDUCED result beyond 2^53 throws OverflowError;
homr never makes one (denominators divide 2^10*3^2*5*7*11*13*17, and durations are multiplied/divided
only by ints), but do not multiply two measure sums. Never compare Fractions with `<`/`===`.

`OMR.transformer_configs`: `modelName`, `FilePaths`, `DecoderArgs`, `Config`, `defaultConfig`.

`OMR.circle_of_fifths`: `definition` (Map int -> 'CbM'…, Python order), `invDefinition` (Map),
`circleOfFifthNotesPositive/Negative`, `keySignatureToCircleOfFifth`, `repeatNoteForAllOctaves`,
`NoKeyTransformation` (`currentAccidentals` Map), `KeyTransformation` (`sharps`/`flats` Sets),
`maintainAccidentalsDuringMeasure`, `stripNaturals`. homr's inference never calls this module
(only training-data converters do); ported for completeness, tested on synthetic sequences only.

`OMR.triplet_restoration`: `restoreUnmarkedTriplets(symbols)` + every private helper
(`_asTriplet, _splitIntoMeasures, _play, _countBreaks, _getLength, _findSingleThrees, _findThrees,
_addFollowingThree, _chooseTriplets, _noteValue, _countByNoteValue`, constants `_MAX_THREES_IN_A_ROW`,
`_MIN_TRIPLETS_ON_A_PAGE`, `_MAX_MEASURE_LENGTH`, `_PLAIN`). JS shapes: Note = `[voice, Fraction, index]`,
frozenset[int] = sorted int array (`fsOf/fsUnion/fsIntersects/fsKey`), Three = `[indices, offBeat]`,
ThreesByPlace = Map `'p0,p1,p2|value'` -> `{places, value, indices, offBeat}` (key via `threeKey`),
`_play` returns the generator's items as an array, Counter = Map.

`OMR.music_xml_generator`
- `generateXml(args, voices, title) -> Element` (root `score-partwise`), `XmlGeneratorArguments(largePage, metronome, tempo)`
- `toXmlString(root)`: what `ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)`
  writes, byte for byte: `<?xml version='1.0' encoding='utf-8'?>\n` + the tree, no indentation
  (homr never calls ET.indent), `<tag />` for empty elements, attributes in insertion order,
  ElementTree's escaping, comments verbatim, lone surrogates as `&#NNNNN;` (xmlcharrefreplace).
- `toBytes(root)`: UTF-8 `Uint8Array` of `toXmlString(root)` (the .musicxml file).
- `xmlToString(el)`: homr's `xml_to_string` = `ET.tostring(el, encoding='unicode')` (no declaration).
- `ET` = `{Element, SubElement, Comment, ProcessingInstruction, tostring}`; `Element` has `tag, attrib
  (plain object), text, tail, length, list(), append, extend, insert, remove (identity), get, set, keys,
  items, find, findall, findtext, iter`, iterable over children. ElementPath subset: `tag`, `a/b`, `*`, `.`.
- every homr function, camelCased: `ConversionState, SymbolChord, buildMeasures, rebalanceMeasureVoices,
  convertTies, tieEvent, groupIntoEvents, buildNoteChord, _groupNotes ([[Fraction, notes]] sorted),
  findDivisionAndTimeSignatureNominators ([division, nominators]), findCommonDivision, _splitMixedChord,
  splitMixedChords, groupIntoChords, TupletParser, addTupletStartStop, build*`, `LIFT_TO_ALTER`,
  `DURATION_NAMES`, `_BEFORE_NOTES_ORDER`; JS only `medianFraction` (np.median of Fractions).

## EncodedSymbol

```js
new EncodedSymbol(rhythm, pitch='.', lift='.', articulation='.', slur='.', position='.', coordinates=null)
new EncodedSymbol('measureRest', {position: 'upper'})            // Python's keyword form
new EncodedSymbol(rhythm, {pitch, lift, articulation, slur, position, coordinates})
```
Fields: `rhythm pitch lift articulation slur position` (strings), `coordinates` (the decoder's
attention, whatever the decoder port stores), `imageCoordinates` (`[x, y]` numbers or null), `_duration`
(getDuration cache). Methods: `isControlSymbol, isTuplet, removeTuplet, changeLift, toUpperPosition,
isValid, addArticulations, addSlurs, stripArticulations / stripSlurs (return [stripped, symbol]),
getDuration (SymbolDuration {baseDuration, dots, actualNotes, normalNotes, fraction, kern}),
toString` (= `str()`: the six fields joined by one space, e.g. `note_8 B4 b _ _ upper`),
`equals` (`__eq__`: the six fields), `hashKey` (`__hash__`), `lt` (`__lt__`, REVERSED in homr:
`str(a) > str(b)`), `copy()` (= `copy.copy`, keeps coordinates and the cache).
`EncodedSymbol.fromString(s)` (JS only) parses `str()` back (6 space-separated fields, coordinates
not included); it round-trips all 5288 distinct symbol strings of the fixtures.

## How parse_staffs (staff_parsing.js, staff_parsing_tromr.js) must call this

- decoder: `new EncodedSymbol(rhythm, {pitch, lift, articulation, slur, position, coordinates: attention})`;
  detokenize with `V.invert(config.rhythmVocab)` etc. (the dicts are `Config.rhythmVocab, pitchVocab,
  liftVocab, articulationVocab, slurVocab, positionVocab`, null-prototype objects token -> id in
  Python's order).
- predict_best: `if (!staff.isGrandstaff) result = result.filter((r) => V.isUpperOrHasNoPosition(r.position))`.
- parse_staff_image: `symbol.imageCoordinates = pageToInputImage(staffToPage(center))` as a 2-element
  array of plain numbers (Python stores np.float64; the imgpos comment is `round()` half-to-even of them).
  `_get_symbol_center` skips `symbol.coordinates === null` and rhythms starting with 'chord'.
- `_measure_rests_like`: `new EncodedSymbol('chord')`, `new EncodedSymbol('measureRest', {position})`,
  `new EncodedSymbol(symbol.rhythm)`.
- voices: push `new EncodedSymbol('newline')` after each staff's symbols, then
  `_clean_up_voice(symbols) = T.restoreUnmarkedTriplets(V.removeDuplicatedSymbols(symbols))`.
- writing: `const root = MX.generateXml(new MX.XmlGeneratorArguments(false, null, null), voices, '')`
  (homr main: `(large_page, metronome, tempo)` from the CLI; SheetLab: `(false, tempoBpm, tempoBpm)` and
  the title), then `MX.toXmlString(root)` / `MX.toBytes(root)`.
- SheetLab merges pages: per voice index concatenate the pages' voices (a 1-voice page also goes into
  voice 0 when others have more), then `V.removeDuplicatedSymbols(merged)` (cleanupTuplets true) per
  non-empty voice, then generateXml. The synthetic fixture has this merge of all 7 pages (exact).

## Gotchas (all reproduced, all covered by the suites)

- Python precedence: `base & (base - 1) == 0` is `(base & (base-1)) == 0`; in JS `==` binds tighter.
- `sorted(chord)` sorts by `str()` DESCENDING (reversed `__lt__`), stable; `reverse=True` sorts
  (into_positions) keep tied items in input order (`py.sorted(..., true)`).
- `_remove_duplicated_piches` stores a longer duplicate under `symbol.pitch` instead of the
  `pitch + ' ' + position` key, so the first note of a pitch always wins. Kept (dead store) for parity.
- `restore_unmarked_triplets` maps symbols to indices by IDENTITY (`id(symbol)`): build each voice with
  distinct objects (the same object twice maps to its last index, like Python).
- `_split_mixed_chord`'s `s not in after` uses `==` (field equality), ported as `a === s || a.equals(s)`.
- `np.median` over Fractions stays a Fraction (mean of the two middle values); `int(Fraction)` truncates.
- `round(x)` of the image coordinates is half to even (`OMR.py.round`); there are exact .5 values. Like
  Python, a NaN coordinate raises ValueError and an infinite one OverflowError (the whole generate_xml
  fails, as in homr), a huge one prints all digits, and `x, y = image_coordinates` needs exactly 2 values.
- KeyError messages are `repr(key)` like Python (`'x'` with quotes for a string key, `3` for an int).
- build_dict strips Python's whitespace (`str.strip`: \x1c-\x1f and \x85 yes, \ufeff no), and the
  kern power-of-two test is exact beyond 32 bits (JS `&` is 32-bit). Both only matter off-vocabulary.
- `_PLAIN` uses Python's `$` (also before a trailing newline); `remove_tuplet` uses `[^\n]*` for `.*`.
- Exceptions keep Python's class name in `error.name` (KeyError for `DURATION_NAMES[3]` of a grace
  `note_3G`/`note_5G`/..., ValueError for unknown articulations/slurs/endings, AssertionError for a
  non-positive backup, IndexError where homr indexes a missing field); messages match homr's.
- The XML declaration says `utf-8` because Python writes to a PATH (main.py, SheetLab, the fixtures);
  writing to an already-open text stream would declare that stream's encoding instead.
- `str(args.metronome)`/`str(tempo)`: pass integers (Python would print `120.0` for a float 120.0).
- Dict-shaped vocabularies are null-prototype objects; `buildDict` rejects integer-like tokens (none
  exist) because a JS object would reorder them.
- Module UPPER_CASE constants keep their names (`DURATION_NAMES`, `_MAX_THREES_IN_A_ROW`, ...).

## Config / models (for runtime.js and the transformer ports)

- `FilePaths` holds file NAMES only: `encoderPath` `encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx`,
  `decoderPath` `decoder_…onnx`, `encoderPathFp16/decoderPathFp16` `…_fp16.onnx`, `checkpoint` `…pth`
  (training), `rhythmtokenizer/lifttokenizer/pitchtokenizer/notetokenizer` `tokenizer_*.json`.
- The tokenizer_*.json files do NOT matter at inference: Staff2Score only checks
  `os.path.exists(rhythmtokenizer)`, and the decoder detokenizes with the Vocabulary dicts. The JSON
  files hold an older, incompatible vocabulary (`clef-C1`, `keySignature-AM`, `lift_null`…). Do not ship them.
- `maxSeqLen 608`, `eosToken 2`, `bosToken 1`, `padToken 0`, `nonoteToken 0`, `decoderDim 512`,
  `decoderHeads 8`, `decoderDepth 8` (cache: 32 tensors `[1, 8, len, 64]`), `maxHeight 256`,
  `maxWidth 1280`, `patchSize 16`, `channels 1`, num tokens rhythm 278 / pitch 72 / lift 7 /
  articulation 89 / slur 5 / position 5.
- The normalisation constants are NOT in configs.py: staff2score.py `ConvertToArray` has mean 0.7931,
  std 0.1738 (`(img/255 - mean)/std`, float64 math then float32) - port them in transformer_staff2score.js.
- `useGpuInference` defaults to true as in Python. In homr that flag selects the `*_fp16.onnx` models
  (also as the CPU fallback when no GPU provider exists); main.py/SheetLab set it from
  transformer_use_gpu (false on a CPU). runtime.js chooses the browser's models itself.

## IMPORTANT for the transformer / pipeline parity agents: which models made the fixtures

`tools/dump_stages.py` and `tools/ref.py` build `Config()` directly, so `use_gpu_inference=True`; on
this machine (no CUDA/ROCm/CoreML) Encoder/get_decoder fall back to
`InferenceSession(config.filepaths.encoder_path_fp16)` / `decoder_path_fp16` - the fp16 models in
`homr/homr/transformer/` - and the `--enc/--dec` swaps (which only change encoder_path/decoder_path)
are ignored (dump.log: "No GPU execution provider ... Going on without GPU support" twice per page).
So `09-staff-*.png` is model-independent, but `10-tokens.json` and `11-score.musicxml` come from the
fp16 encoder + fp16 decoder, not the shipping int8 encoder (qmodels) + int8 decoder; only segnet was the
shipping (qmodels) one. ref-q8 vs ref-fp32 therefore measured segnet quantisation only.
`dump_lang.py --ship` sets `use_gpu_inference=False` so the shipping encoder/decoder really run
(`12-lang-ship-*.json`): final voices are identical on 6 pages, brahms-vals3-p1 differs by 1 token
(1 edit in 2901 tokens); the imgpos coordinates differ on every page (attention changes slightly).
A JS transformer running the shipping models should be compared with `12-lang-ship-voices.json`
(or fixtures regenerated with use_gpu_inference=False), not with 10-tokens.json.

## Not done / out of scope

- No repo fixtures (tests/fixtures/omr) for this area: not in my file list. Without
  SL_OMR_FIXTURES both suites run their fixture-free checks and SKIP the rest.
- `constants.js` did not exist yet when this was written: omr-xml.test.js prints one FAIL
  ("OMR.constants is loaded") until it lands; with a dev shim defining `durationOfQuarter: 16`
  (the Python value) all 45 checks pass.

## Second audit (API boundary)

A differential fuzz of 9,800 voices (every vocabulary field, chords, aliases, ties, voltas, tremolos,
image coordinates, args and titles) through every function of the area found no divergence on
vocabulary input. The divergences found were all at the API boundary. Each is now fixed and pinned
by `12-lang-audit.json` key `boundary` (`dump_lang.py --audit`):
- `XmlGeneratorArguments`: Python truthiness (NaN is true) and Python `str()` (`nan`, `inf`,
  `1000000000000000000000`, `1e-07`, `True`). An integral JS number counts as an int. -0 counts as
  -0.0. A Python float like 120.0 has no JS twin, so pass integers.
- `cleanup_tuplets`, `keep_chord_symbol` and `remove_all` use Python truthiness (`V.pyTruthy`).
- `prior_power_of_two(Infinity)` and a kern of 309+ digits used to loop forever. A float now raises
  AttributeError like Python, and a kern base past 2^53 raises OverflowError.
- `remove_tuplet` handles durations past 15 digits exactly (BigInt), giving Python's string.
- `find_common_division` computes the lcm without `a * b`, which could round past 2^53 and return a
  non-integer division. An lcm past 2^53 raises OverflowError.
- `add_articulations` / `add_slurs` follow `list.extend` (a str adds its characters, a dict its
  keys). `strip_*` follow Python's `in` (str = substring, set, dict).
- `str(symbol)` with a non-str field raises TypeError like `str.join` (it used to print `null` as
  empty). `hashKey()` does not raise.
- Serializer: `if text:` uses Python truthiness, so a NaN text is refused rather than skipped.
  Comments and PIs print `str()`, `findtext` returns a non-None text unchanged, and errors say
  `cannot serialize %r (type %s)` with Python type names.
- `int()` error messages use repr. Clef sign/line and pitch step/octave index code points.
  `_note_value` raises like Python on empty indices or a rhythm without "_".
- `_to_fraction` computes only the dot halves it adds. Python's extra `add / 2` made 2^52 bases
  overflow for nothing.

Still not mirrored (no vocabulary token or homr call reaches it):
- Unicode digits in kern / `int()`.
- Namespaced `{uri}` tags (NotImplementedError).
- A Python float with an integral value printed as `120.0`.
- Python's int() accepting `1_000`.
