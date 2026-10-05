#!/usr/bin/env python3
"""Stage soundLAB as a multi-file claude.ai Artifact.

    python3 tools/artifact_build.py <out_dir>

Writes <out_dir>/index.html (the page) plus every asset it loads at the same
relative paths, and prints the asset list. Publish with the Artifact tool:
file_path=<out_dir>/index.html, root=<out_dir>, files=<that list>. On later
releases pass only the files that changed — the artifact keeps the rest.

The page is adapted to the artifact viewer's contract:
  - the viewer supplies <!doctype>/<html>/<head>/<body>, so those are removed
  - <title> becomes the plain app name (the viewer's gallery name)
  - no service worker (the viewer refuses them), no web manifest/PWA links
  - window.SL_ARTIFACT = true, which turns off the GitHub update checker
"""
import os, re, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIRS = ['js', 'css', 'fonts', 'icons', 'samples']
ASSET_EXT = {'.js', '.css', '.woff2', '.ttf', '.svg', '.png', '.mp3'}


def page_html():
    with open(os.path.join(REPO, 'index.html'), encoding='utf-8') as f:
        s = f.read()
    s = re.sub(r'<!DOCTYPE html>\s*', '', s, flags=re.I)
    s = re.sub(r'</?html[^>]*>\s*', '', s)
    s = re.sub(r'</?head>\s*', '', s)
    s = re.sub(r'</?body>\s*', '', s)
    s = re.sub(r'<meta [^>]*>\s*', '', s)
    s = re.sub(r'<link rel="(icon|manifest|apple-touch-icon)"[^>]*>\s*', '', s)
    s = re.sub(r'<title>.*?</title>', '<title>soundLAB</title>', s, flags=re.S)
    # drop the service-worker registration (refused by the viewer)
    s = re.sub(r'// Offline support.*?\n}\n', '', s, flags=re.S)
    assert 'serviceWorker' not in s, 'service worker block not stripped'
    s = s.replace('<script src="js/theory.js"></script>',
                  '<script>window.SL_ARTIFACT = true;</script>\n'
                  '<script src="js/theory.js"></script>', 1)
    assert 'SL_ARTIFACT' in s
    return s.strip() + '\n'


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = os.path.abspath(sys.argv[1])
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page_html())
    files = []
    for d in ASSET_DIRS:
        for dirpath, _, names in os.walk(os.path.join(REPO, d)):
            for n in sorted(names):
                if os.path.splitext(n)[1].lower() not in ASSET_EXT:
                    continue
                src = os.path.join(dirpath, n)
                rel = os.path.relpath(src, REPO).replace(os.sep, '/')
                dst = os.path.join(out, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
                files.append(rel)
    files.sort()
    size = sum(os.path.getsize(os.path.join(out, p)) for p in files)
    print('page: ' + os.path.join(out, 'index.html'))
    print('%d asset files, %.1f MB' % (len(files), size / 1e6))
    for p in files:
        print(p)


if __name__ == '__main__':
    main()
