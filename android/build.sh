#!/usr/bin/env bash
# soundLAB APK build for Linux (cloud sessions / CI) — the same pipeline as
# build.ps1: javac -> d8 -> aapt package (res + assets) -> zipalign -> apksigner.
#
#   ANDROID_JAR   path to platforms/android-34/android.jar
#   BUILD_TOOLS   dir holding d8, aapt, zipalign, apksigner (build-tools 34)
#   KEYSTORE      the signing key (PKCS12). NEVER commit it; never generate a
#                 replacement — a new key means every user reinstalls.
#   KEYSTORE_PASS optional, default empty (the key is a passwordless PKCS12)
#   D8_JAR        optional r8.jar (Google Maven com.android.tools:r8) — the d8
#                 shipped in build-tools 34 crashes on JDK 21; 8.7.x works
#
# Writes releases/soundLAB-alpha.apk (+ the GuitarLab-alpha.apk copy for old
# links) and sets the APK channel ("version") in version.json to the
# manifest's versionName — the only place that channel may move.
set -euo pipefail

: "${ANDROID_JAR:?set ANDROID_JAR to platforms/android-34/android.jar}"
: "${BUILD_TOOLS:?set BUILD_TOOLS to a build-tools 34 directory}"
: "${KEYSTORE:?set KEYSTORE to the signing key (android/soundlab.keystore)}"
KEYSTORE_PASS="${KEYSTORE_PASS:-}"

proj="$(cd "$(dirname "$0")" && pwd)"   # android/
web="$(dirname "$proj")"                 # repo root = the web app
out="$proj/build"
apk="$web/releases/soundLAB-alpha.apk"

rm -rf "$out"
mkdir -p "$out/obj" "$out/dex" "$out/assets" "$web/releases"

# the bundled copy is only the OFFLINE FALLBACK — the app loads the live site
cp "$web/index.html" "$web/manifest.webmanifest" "$out/assets/"
cp -r "$web/css" "$web/js" "$web/icons" "$web/fonts" "$web/samples" "$web/data" "$out/assets/"

echo "==> javac"
javac -source 8 -target 8 -nowarn -classpath "$ANDROID_JAR" -d "$out/obj" \
  "$proj"/src/com/mreindl/soundlab/*.java

echo "==> d8"
if [ -n "${D8_JAR:-}" ]; then d8=(java -cp "$D8_JAR" com.android.tools.r8.D8); else d8=("$BUILD_TOOLS/d8"); fi
"${d8[@]}" --release --min-api 24 --lib "$ANDROID_JAR" --output "$out/dex" $(find "$out/obj" -name '*.class')

echo "==> aapt package"
"$BUILD_TOOLS/aapt" package -f -M "$proj/AndroidManifest.xml" -S "$proj/res" -A "$out/assets" \
  -I "$ANDROID_JAR" -F "$out/unsigned.apk"
(cd "$out/dex" && "$BUILD_TOOLS/aapt" add "$out/unsigned.apk" classes.dex >/dev/null)

echo "==> zipalign"
"$BUILD_TOOLS/zipalign" -f 4 "$out/unsigned.apk" "$out/aligned.apk"

echo "==> apksigner"
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KEYSTORE_PASS" --out "$apk" "$out/aligned.apk"
rm -f "$apk.idsig"
"$BUILD_TOOLS/apksigner" verify "$apk"
cp -f "$apk" "$web/releases/GuitarLab-alpha.apk"

# the APK channel of the update feed now names the APK that exists
vn="$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$proj/AndroidManifest.xml" | head -1)"
[ -n "$vn" ] || { echo "versionName not found in AndroidManifest.xml" >&2; exit 1; }
python3 - "$web/version.json" "$vn" <<'PY'
import json, sys
path, vn = sys.argv[1], sys.argv[2]
with open(path, encoding='utf-8') as f:
    d = json.load(f)
d['version'] = vn
with open(path, 'w', encoding='utf-8') as f:
    f.write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
PY
echo "==> version.json APK channel -> $vn"

"$BUILD_TOOLS/aapt" dump badging "$apk" | grep -E "^package|launchable-activity|sdkVersion" || true
echo "APK: $apk ($(du -h "$apk" | cut -f1))"
