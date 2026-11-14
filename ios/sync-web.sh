#!/bin/sh
# Copy the web app into ios/WebAssets/ for bundling (mirrors android/build.ps1;
# sw.js omitted — no service workers on file://).
set -e
cd "$(dirname "$0")"
rm -rf WebAssets
mkdir -p WebAssets
cp ../index.html ../gear.html ../manifest.webmanifest WebAssets/
cp -R ../css ../js ../icons ../fonts ../samples ../data WebAssets/
echo "WebAssets ready: $(find WebAssets -type f | wc -l | tr -d ' ') files"
