# Original raster-only PDF recognition fixture

`17-page-treble-quarters-clean.pdf` is the unchanged raster-only PDF from the
frozen SoundLab original engraving corpus. Original composition and generator:
CC0-1.0. Engraving: Verovio6.3.0; raster generation: CairoSVG/Pillow. This is
synthetic engraving, not a private score or a real scanner sample. `pdffonts`
reports no fonts: the PDF contains its rendered page image.

PDF SHA-256: `4ee35529c94362f92b100048818a2ad43670a719141977b90da8ab8909b680bb`.
The adjacent authored truth JSON is assertion data only. The recognizer receives
only the pixels rendered from the PDF. Tests inspect truth after inference;
they never pass it, the filename, source MusicXML or SVG to the model. Selecting
one staff does not establish full-page transcription or cross-staff timing.
