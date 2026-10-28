/* soundLAB OMR: port of homr/constants.py (AGPL-3.0, github.com/liebharc/homr).
   Module constants become OMR.constants.camelCase; the functions of the unit size keep
   their argument. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var py = OMR.py;

  OMR.constants = {
    numberOfLinesOnAStaff: 5,
    maxNumberOfLedgerLines: 4,
    toleranceForStaffLineDetection: function (unitSize) { return unitSize / 3; },
    maxLineGapSize: function (unitSize) { return 5 * unitSize; },
    isShortLine: function (unitSize) { return unitSize / 5; },
    isShortConnectedLine: function (unitSize) { return 2 * unitSize; },
    minHeightForBraceRough: function (unitSize) { return 2 * unitSize; },
    maxWidthForBraceRough: function (unitSize) { return 3 * unitSize; },
    minHeightForBrace: function (unitSize) { return 4 * unitSize; },
    // int(round(unit_size * 2)): round half to even
    toleranceForTouchingClefs: function (unitSize) { return py.int(py.round(unitSize * 2)); },
    toleranceForStaffAtAnyPoint: function (unitSize) { return 0; },
    toleranceNoteGrouping: function (unitSize) { return 1 * unitSize; },
    barLineMaxWidth: function (unitSize) { return 2 * unitSize; },
    barLineMinHeight: function (unitSize) { return 3 * unitSize; },
    blackSpotRemovalThreshold: function (unitSize) { return 2 * unitSize; },
    staffLineSegmentXTolerance: 10,
    // We don't have to worry about mis-detections,
    // because if not all staffs group the same way then we break the staffs up again
    minimumConnectionsToFormCombinedStaff: 1,
    durationOfQuarter: 16,
    imageNoiseLimit: 50,
    staffPositionTolerance: 50,
    maxAngleForLinesToBeParallel: 10,
    noteheadSizeRatio: 1.285714, // width/height (NOTEHEAD_SIZE_RATIO)
    grandstaffXDistanceThresholdFactor: 5,
    grandstaffYOverlapThresholdFactor: 0.5,
    // A brace/bracket candidate blob can end up merged with unrelated ink that
    // happens to touch it during preprocessing (e.g. a neighboring staff's clef).
    // Such contamination is reliably thinner than the brace itself, so we keep
    // only the vertical range where the blob is at least this fraction as wide
    // as its own widest row, which recovers the true brace span regardless of
    // how much extra ink got attached to it.
    braceCoreWidthRatio: 0.5,
    // prepare_brace_dot_image's morphological dilation (brace_dot_detection) uses a 5px-wide
    // kernel to bridge small gaps in brace/bracket ink into single blobs. A whole-system
    // bracket that crosses a staff line's own ink can occasionally break into two contours
    // there: the main bracket (correctly wide) plus a small, sparse leftover fragment too thin
    // to fully dilate back up to kernel width. That leftover is small enough to fit entirely
    // within a single staff pair's span, so it can still score well in
    // _score_brace_with_staff_pair despite being noise, not a real brace - this is an absolute
    // pixel width tied to the kernel itself, not to staff unit size, since it is about the
    // morphology op, not the music engraving. 5 (not 4): observed leftover fragments were
    // 2-4px wide, while every genuine candidate (barline connectors, real braces) observed
    // across smb/polish-scores/testdata was >=5px - exactly the dilation kernel's own width.
    minWidthForBraceDotCandidate: 5
  };
})(typeof self !== 'undefined' ? self : globalThis);
