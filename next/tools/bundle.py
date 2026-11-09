"""Bundle GuitarLab into a single self-contained HTML fragment for publishing
as a claude.ai artifact (fonts inlined as data URIs; samples excluded — the
jam module falls back to synth voices there).

Usage: python tools/bundle.py <output.html>
"""
import re, io, sys, base64, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]

SCRIPTS = ["theory.js", "app.js", "metronome.js", "fretboard.js",
           "chords.js", "jam.js", "tuner.js", "trainer.js"]

def read(p):
    with io.open(os.path.join(ROOT, p), "r", encoding="utf-8") as f:
        return f.read()

html = read("index.html")
css = read(os.path.join("css", "style.css"))

def font_data_uri(m):
    path = os.path.join(ROOT, "fonts", os.path.basename(m.group(1)))
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return "url(data:font/woff2;base64," + b64 + ")"

css = re.sub(r"url\('(\.\./fonts/[^']+)'\)", font_data_uri, css)

scripts = [read(os.path.join("js", n)) for n in SCRIPTS]
for s in scripts:
    assert "</script" not in s.lower(), "script content would break inline embedding"

body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.S).strip()

parts = [
    "<title>GuitarLab — Guitar Practice Companion</title>",
    "<style>\n" + css + "\n</style>",
    body,
    "<script>\n" + "\n;\n".join(scripts) + "\n;App.boot();\n</script>",
]
with io.open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(parts))
print("wrote", OUT, sum(len(p) for p in parts), "chars")
