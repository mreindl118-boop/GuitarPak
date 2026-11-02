# The owner's SheetLab engine (the desktop SheetLab app's tools/sheetlab_engine.py), adapted to the
# homr API at 2d7e8c3. Kept here as the REFERENCE the parity tools need (tools/omr/dump_e2e.py and
# dump_sheetlab_prep.py take it with --engine; see tools/omr/README.md). Not shipped: js/omr/engine.js is
# its JavaScript port.
"""Core Optical Music Recognition (OMR) & MIDI/MusicXML translation engine.

Supports:
- Single and multi-page PDF sheet music (.pdf) via PyMuPDF (fitz)
- Raster sheet music images (.png, .jpg, .jpeg, .webp, .bmp, .tif, .tiff)
- Automatic low-res upscaling & contrast normalization
- Optional 2-page landscape booklet spread splitting
- Cover/blank page skipping (pages without musical staves don't abort multi-page PDFs)
- Multi-page voice/part concatenation into unified MusicXML 4.0 (.musicxml, .xml, .mxl)
- Standard MIDI (.mid, .midi) synthesis with configurable BPM tempo, GM instrument program,
  and semitone transposition via music21 + mido.
"""
from __future__ import annotations

import os
import shutil
import tempfile
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import cv2
import fitz  # PyMuPDF
import mido
import music21
import numpy as np
import onnxruntime as ort
from PIL import Image

from homr.debug import Debug
from homr.main import (
    ProcessingConfig,
    XmlGeneratorArguments,
    cuda_available,
    detect_staffs_in_image,
    download_weights,
)
from homr.music_xml_generator import generate_xml
from homr.staff_parsing import parse_staffs
from homr.transformer.configs import Config
from homr.transformer.vocabulary import EncodedSymbol, remove_duplicated_symbols

ort.set_default_logger_severity(3)

GM_INSTRUMENTS: dict[str, int] = {
    "Acoustic Grand Piano": 0,
    "Bright Acoustic Piano": 1,
    "Honky-tonk / Ragtime Piano": 3,
    "Electric Piano (Rhodes)": 4,
    "Harpsichord": 6,
    "Celesta": 8,
    "Music Box": 10,
    "Vibraphone": 11,
    "Marimba": 12,
    "Church Organ": 19,
    "Accordion": 21,
    "Acoustic Guitar (Nylon)": 24,
    "Acoustic Guitar (Steel)": 25,
    "Electric Guitar (Jazz)": 26,
    "Electric Guitar (Clean)": 27,
    "Acoustic Bass": 32,
    "Violin": 40,
    "Viola": 41,
    "Cello": 42,
    "String Ensemble": 48,
    "Choir Aahs": 52,
    "Trumpet": 56,
    "Trombone": 57,
    "French Horn": 60,
    "Alto Sax": 65,
    "Tenor Sax": 66,
    "Oboe": 68,
    "Clarinet": 71,
    "Flute": 73,
}

SUPPORTED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
SUPPORTED_EXTS = {".pdf"} | SUPPORTED_IMAGE_EXTS


@dataclass
class TranslationOptions:
    output_dir: Path
    export_mid: bool = True
    export_midi: bool = True
    export_musicxml: bool = True
    export_xml: bool = True
    export_mxl: bool = True
    export_page_files: bool = False
    tempo_bpm: int = 112
    instrument_name: str = "Acoustic Grand Piano"
    transpose_semitones: int = 0
    pdf_dpi: int = 300
    split_wide_spreads: bool = True
    upscale_low_res: bool = True


@dataclass
class PageAnalysis:
    page_number: int
    label: str
    source_image_path: str
    teaser_image_path: str | None = None
    staff_count: int = 0
    voice_count: int = 0
    skipped_reason: str | None = None
    voices: list[list[EncodedSymbol]] = field(default_factory=list)
    detected_title: str = ""


@dataclass
class NoteEvent:
    pitch_midi: int
    pitch_name: str
    start_beat: float
    duration_beats: float
    part_index: int


@dataclass
class TranslationResult:
    source_path: Path
    success: bool
    title: str = ""
    error_message: str = ""
    pages_processed: int = 0
    pages_skipped: int = 0
    total_measures: int = 0
    total_notes: int = 0
    total_chords: int = 0
    duration_seconds: float = 0.0
    output_files: dict[str, Path] = field(default_factory=dict)
    preview_image_path: Path | None = None
    original_page_image_path: Path | None = None
    note_events: list[NoteEvent] = field(default_factory=list)
    page_summaries: list[str] = field(default_factory=list)


def load_image_unicode_safe(path: str | Path) -> np.ndarray:
    """Read an image into BGR numpy array safely regardless of Windows Unicode/special path chars."""
    pil_img = Image.open(path).convert("RGB")
    rgb = np.array(pil_img, dtype=np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def save_image_unicode_safe(path: str | Path, bgr: np.ndarray) -> None:
    """Write a BGR numpy array to disk safely."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    Image.fromarray(rgb).save(path)


def preprocess_sheet_image(
    bgr: np.ndarray,
    upscale_low_res: bool = True,
) -> np.ndarray:
    """Prepare a sheet music image for optimal SegNet + TrOMR recognition."""
    img = bgr.copy()
    h, w = img.shape[:2]

    # Strip solid dark outer scan frames (e.g. Vinyl Booklet scans)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    border_check = np.concatenate([
        gray[0:8, :].ravel(),
        gray[-8:, :].ravel(),
        gray[:, 0:8].ravel(),
        gray[:, -8:].ravel(),
    ])
    if np.median(border_check) < 65:
        _, light_mask = cv2.threshold(gray, 110, 255, cv2.THRESH_BINARY)
        coords = cv2.findNonZero(light_mask)
        if coords is not None:
            x, y, bw, bh = cv2.boundingRect(coords)
            if bw > w * 0.6 and bh > h * 0.6:
                img = img[y : y + bh, x : x + bw]
                h, w = img.shape[:2]

    # Upscale low-resolution images so noteheads have enough pixels
    if upscale_low_res and min(h, w) < 1050:
        scale = 1450.0 / float(min(h, w))
        new_w = int(round(w * scale))
        new_h = int(round(h * scale))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        blurred = cv2.GaussianBlur(img, (0, 0), sigmaX=1.2)
        img = cv2.addWeighted(img, 1.35, blurred, -0.35, 0)

    return img


def maybe_split_landscape_spread(
    bgr: np.ndarray, enable_split: bool = True
) -> list[tuple[str, np.ndarray]]:
    """If an image is a wide 2-page booklet scan (width > 1.32 * height), split into Left and Right pages."""
    h, w = bgr.shape[:2]
    if enable_split and w > h * 1.32 and w >= 1800:
        mid = w // 2
        overlap = int(w * 0.01)
        left_page = bgr[:, : mid + overlap]
        right_page = bgr[:, mid - overlap :]
        return [("Left", left_page), ("Right", right_page)]
    return [("", bgr)]


class SheetMusicTranslator:
    """High-level OMR translator converting PDF and image sheet music to MIDI & MusicXML."""

    def __init__(self) -> None:
        self._weights_ready = False
        self.use_gpu = bool(cuda_available())

    def ensure_weights(self, log_fn: Callable[[str], None] | None = None) -> None:
        if self._weights_ready:
            return
        if log_fn:
            log_fn("Initializing ONNX OMR models...")
        download_weights(self.use_gpu, self.use_gpu, False)
        self._weights_ready = True

    def _analyze_single_page_image(
        self,
        image_path: str,
        page_num: int,
        label: str,
        config: ProcessingConfig,
    ) -> PageAnalysis:
        analysis = PageAnalysis(
            page_number=page_num,
            label=label,
            source_image_path=image_path,
        )
        debug_cleanup: Debug | None = None
        try:
            multi_staffs, preprocessed_img, debug, title_future, _n, _map = detect_staffs_in_image(
                image_path, config
            )
            from homr.system_repair import repair_systems
            multi_staffs = repair_systems(debug, multi_staffs)
            debug_cleanup = debug
            analysis.staff_count = sum(len(ms.staffs) for ms in multi_staffs)

            transformer_config = Config()
            transformer_config.use_gpu_inference = config.transformer_use_gpu
            transformer_config.use_coreml_encoder = config.coreml_encoder

            voices = parse_staffs(
                debug,
                multi_staffs,
                preprocessed_img,
                selected_staff=config.selected_staff,
                config=transformer_config,
            )
            analysis.voices = voices
            analysis.voice_count = len(voices)
            try:
                analysis.detected_title = (title_future.result(30) or "").strip()
            except Exception:
                analysis.detected_title = ""

            teaser_file = os.path.splitext(image_path)[0] + "_teaser.png"
            debug.write_teaser(teaser_file, multi_staffs)
            if os.path.exists(teaser_file):
                analysis.teaser_image_path = teaser_file

        except Exception as exc:
            msg = str(exc)
            if "No noteheads found" in msg or "No staffs found" in msg:
                analysis.skipped_reason = f"Non-music / cover page ({msg})"
            else:
                analysis.skipped_reason = f"OMR skipped page ({msg})"
        finally:
            if debug_cleanup is not None:
                try:
                    debug_cleanup.clean_debug_files_from_previous_runs()
                except Exception:
                    pass
        return analysis

    def translate_file(
        self,
        source_path: str | Path,
        options: TranslationOptions,
        log_fn: Callable[[str], None] | None = None,
        progress_fn: Callable[[float, str], None] | None = None,
    ) -> TranslationResult:
        src = Path(source_path).resolve()
        result = TranslationResult(source_path=src, success=False)

        def log(msg: str) -> None:
            if log_fn:
                log_fn(msg)

        def progress(p: float, msg: str) -> None:
            if progress_fn:
                progress_fn(max(0.0, min(1.0, p)), msg)
            log(msg)

        if not src.exists():
            result.error_message = f"File not found: {src}"
            return result

        ext = src.suffix.lower()
        if ext not in SUPPORTED_EXTS:
            result.error_message = f"Unsupported file extension: {ext}"
            return result

        options.output_dir.mkdir(parents=True, exist_ok=True)
        self.ensure_weights(log_fn=log)

        work_dir = Path(tempfile.mkdtemp(prefix="sheet2midi_"))
        try:
            # Step 1: Extract & preprocess page images
            progress(0.05, f"Loading {src.name}...")
            page_inputs: list[tuple[int, str, Path]] = []

            if ext == ".pdf":
                doc = fitz.open(str(src))
                pdf_title = (doc.metadata or {}).get("title", "").strip()
                if pdf_title:
                    result.title = pdf_title
                num_pdf_pages = len(doc)
                log(f"PDF has {num_pdf_pages} page(s). Rendering at {options.pdf_dpi} DPI...")
                idx = 1
                for pno in range(num_pdf_pages):
                    pix = doc[pno].get_pixmap(dpi=options.pdf_dpi, alpha=False)
                    img_rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                        pix.height, pix.width, 3
                    )
                    bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
                    splits = maybe_split_landscape_spread(bgr, options.split_wide_spreads)
                    for side_label, sub_bgr in splits:
                        prep = preprocess_sheet_image(sub_bgr, options.upscale_low_res)
                        lbl = f"Page {pno + 1}" + (f" ({side_label})" if side_label else "")
                        img_file = work_dir / f"page_{idx:03d}.png"
                        save_image_unicode_safe(img_file, prep)
                        page_inputs.append((idx, lbl, img_file))
                        idx += 1
                doc.close()
            else:
                bgr = load_image_unicode_safe(src)
                splits = maybe_split_landscape_spread(bgr, options.split_wide_spreads)
                idx = 1
                for side_label, sub_bgr in splits:
                    prep = preprocess_sheet_image(sub_bgr, options.upscale_low_res)
                    lbl = f"Page 1" + (f" ({side_label})" if side_label else "")
                    img_file = work_dir / f"page_{idx:03d}.png"
                    save_image_unicode_safe(img_file, prep)
                    page_inputs.append((idx, lbl, img_file))
                    idx += 1

            # Step 2: Run OMR on each page
            cfg = ProcessingConfig(
                enable_debug=False,
                enable_cache=False,
                write_staff_positions=False,
                read_staff_positions=False,
                selected_staff=-1,
                transformer_use_gpu=self.use_gpu,
                segnet_use_gpu=self.use_gpu,
                coreml_encoder=False,
                title_detection=False,
            )
            xml_args = XmlGeneratorArguments(
                large_page=False,
                metronome=options.tempo_bpm,
                tempo=options.tempo_bpm,
            )

            valid_pages: list[PageAnalysis] = []
            total_pages = len(page_inputs)

            for i, (page_idx, page_label, img_path) in enumerate(page_inputs):
                frac = 0.12 + 0.65 * (i / max(1, total_pages))
                progress(
                    frac,
                    f"Recognizing musical notation on {page_label} ({i + 1}/{total_pages})...",
                )
                analysis = self._analyze_single_page_image(
                    str(img_path), page_idx, page_label, cfg
                )
                if analysis.skipped_reason or not analysis.voices:
                    result.pages_skipped += 1
                    reason = analysis.skipped_reason or "No musical voices detected"
                    result.page_summaries.append(f"{page_label}: Skipped — {reason}")
                else:
                    result.pages_processed += 1
                    valid_pages.append(analysis)
                    if not result.title and analysis.detected_title:
                        result.title = analysis.detected_title
                    result.page_summaries.append(
                        f"{page_label}: Detected {analysis.staff_count} staff(s), "
                        f"{analysis.voice_count} part(s)"
                    )

            if not valid_pages:
                result.error_message = "No musical staves or noteheads could be detected in this file."
                return result

            if not result.title:
                result.title = src.stem.replace("-", " ").replace("_", " ").title()

            # Step 3: Merge voices across all valid pages into unified score
            progress(0.80, "Merging staves and generating MusicXML 4.0...")
            max_voices = max(len(p.voices) for p in valid_pages)
            merged_voices: list[list[EncodedSymbol]] = [[] for _ in range(max_voices)]

            for p in valid_pages:
                for v_idx in range(max_voices):
                    if v_idx < len(p.voices):
                        merged_voices[v_idx].extend(p.voices[v_idx])
                    elif len(p.voices) == 1 and v_idx == 0:
                        merged_voices[0].extend(p.voices[0])

            cleaned_voices = [
                remove_duplicated_symbols(v) for v in merged_voices if len(v) > 0
            ]

            xml_root = generate_xml(xml_args, cleaned_voices, result.title)
            temp_musicxml = work_dir / f"{src.stem}.musicxml"
            import xml.etree.ElementTree as _ET
            _ET.ElementTree(xml_root).write(str(temp_musicxml), encoding='unicode', xml_declaration=True)

            # Step 4: Parse with music21, apply tempo / instrument / transposition, export all formats
            progress(0.88, "Synthesizing MIDI & MusicXML formats...")
            score = music21.converter.parse(str(temp_musicxml))

            if options.transpose_semitones != 0:
                score = score.transpose(options.transpose_semitones)

            gm_prog = GM_INSTRUMENTS.get(options.instrument_name, 0)
            for part in score.parts:
                inst = music21.instrument.instrumentFromMidiProgram(gm_prog)
                inst.instrumentName = options.instrument_name
                part.insert(0, inst)
                part.insert(0, music21.tempo.MetronomeMark(number=options.tempo_bpm))

            safe_stem = src.stem
            if options.export_mxl:
                temp_mxl = work_dir / f"{safe_stem}_out.mxl"
                score.write("mxl", fp=str(temp_mxl))
                out_mxl = options.output_dir / f"{safe_stem}.mxl"
                shutil.copy2(temp_mxl, out_mxl)
                result.output_files["mxl"] = out_mxl

            if options.export_musicxml:
                out_musicxml = options.output_dir / f"{safe_stem}.musicxml"
                if options.transpose_semitones == 0:
                    shutil.copy2(temp_musicxml, out_musicxml)
                else:
                    score.write("musicxml", fp=str(out_musicxml))
                result.output_files["musicxml"] = out_musicxml

            if options.export_xml:
                out_xml = options.output_dir / f"{safe_stem}.xml"
                if options.transpose_semitones == 0:
                    shutil.copy2(temp_musicxml, out_xml)
                else:
                    temp_xml = work_dir / f"{safe_stem}_transposed.musicxml"
                    score.write("musicxml", fp=str(temp_xml))
                    shutil.copy2(temp_xml, out_xml)
                result.output_files["xml"] = out_xml

            temp_mid = work_dir / f"{safe_stem}_raw.mid"
            score.write("midi", fp=str(temp_mid))
            self._polish_midi_file(temp_mid, options.tempo_bpm, gm_prog, result.title)

            if options.export_mid:
                out_mid = options.output_dir / f"{safe_stem}.mid"
                shutil.copy2(temp_mid, out_mid)
                result.output_files["mid"] = out_mid

            if options.export_midi:
                out_midi = options.output_dir / f"{safe_stem}.midi"
                shutil.copy2(temp_mid, out_midi)
                result.output_files["midi"] = out_midi

            result.success = True
            return result
        except Exception as exc:
            result.error_message = f"{type(exc).__name__}: {exc}"
            log(f"Error translating {src.name}:\n{traceback.format_exc()}")
            return result
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    @staticmethod
    def _polish_midi_file(
        mid_path: Path, tempo_bpm: int, gm_program: int, title: str
    ) -> None:
        """Ensure clean tempo metadata and GM program change on all tracks."""
        try:
            mid = mido.MidiFile(str(mid_path))
            tempo_us = mido.bpm2tempo(tempo_bpm)
            for idx, track in enumerate(mid.tracks):
                if idx == 0:
                    track.insert(0, mido.MetaMessage("set_tempo", tempo=tempo_us, time=0))
                    if title:
                        track.insert(0, mido.MetaMessage("track_name", name=title, time=0))
                has_prog = False
                for msg in track:
                    if msg.type == "program_change":
                        msg.program = gm_program
                        has_prog = True
                if not has_prog:
                    track.insert(
                        0, mido.Message("program_change", program=gm_program, channel=0, time=0)
                    )
            mid.save(str(mid_path))
        except Exception:
            pass