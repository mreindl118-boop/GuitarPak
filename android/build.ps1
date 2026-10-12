# GuitarLab APK build — no Gradle, raw SDK toolchain.
# Pipeline: javac -> d8 (dex) -> aapt package (res + assets) -> zipalign -> apksigner.
$ErrorActionPreference = 'Stop'

$tools    = 'C:\Users\mrein\AndroidBuildTools'
$jdk      = "$tools\jdk-17.0.19+10"
$bt       = "$tools\sdk\build-tools\34.0.0"
$platform = "$tools\sdk\platforms\android-34\android.jar"
$proj     = $PSScriptRoot                 # android/ inside the repo
$web      = Split-Path $PSScriptRoot      # repo root = the web app
$apkOut   = "$web\releases\soundLAB-alpha.apk"    # the download link in README + version.json
$apkOld   = "$web\releases\GuitarLab-alpha.apk"   # same file under the pre-rename name, for old links
$out      = "$proj\build"

$env:JAVA_HOME = $jdk   # d8.bat / apksigner.bat resolve java through JAVA_HOME

function Step($name, $block) {
    Write-Host "==> $name"
    & $block
    if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" }
}

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force "$out\obj", "$out\dex", "$out\assets" | Out-Null

# Bundle the web app as WebView assets — the OFFLINE FALLBACK only: the app
# loads the live site (MainActivity.LIVE_URL) whenever it can, so web releases
# reach Android without a new APK. (sw.js omitted — no service workers on file://.)
Copy-Item "$web\index.html" "$out\assets\"
Copy-Item "$web\manifest.webmanifest" "$out\assets\"
Copy-Item -Recurse "$web\css", "$web\js", "$web\icons", "$web\fonts", "$web\samples" "$out\assets\"

Step 'javac' { & "$jdk\bin\javac.exe" -source 8 -target 8 -nowarn -classpath $platform -d "$out\obj" "$proj\src\com\mreindl\soundlab\MainActivity.java" }

$classes = (Get-ChildItem "$out\obj" -Recurse -Filter *.class).FullName
Step 'd8' { & "$bt\d8.bat" --release --lib $platform --output "$out\dex" @classes }

Step 'aapt package' { & "$bt\aapt.exe" package -f -M "$proj\AndroidManifest.xml" -S "$proj\res" -A "$out\assets" -I $platform -F "$out\unsigned.apk" }

Push-Location "$out\dex"
Step 'aapt add dex' { & "$bt\aapt.exe" add "$out\unsigned.apk" "classes.dex" }
Pop-Location

Step 'zipalign' { & "$bt\zipalign.exe" -f 4 "$out\unsigned.apk" "$out\aligned.apk" }

# The keystore (passwordless PKCS12; the file itself is the secret) must already
# exist. Never auto-generate a replacement: a new key changes the app signature
# and breaks in-place updates for every install.
# Since v0.70.2 the app (com.mreindl.soundlab) is signed with soundlab.keystore
# — NOT the old guitarlab.keystore (that signed the retired com.mreindl.guitarlab).
if (-not (Test-Path "$proj\soundlab.keystore")) {
    throw 'android/soundlab.keystore is missing - restore it from backup. Do NOT generate a new one.'
}

New-Item -ItemType Directory -Force (Split-Path $apkOut) | Out-Null
Step 'apksigner' { & "$bt\apksigner.bat" sign --ks "$proj\soundlab.keystore" --ks-pass pass: --out $apkOut "$out\aligned.apk" }

Copy-Item $apkOut $apkOld -Force

# The APK channel of the update feed ("version" in version.json) must name the
# APK that now actually exists — and ONLY this script moves it. Web-only
# releases bump "web" instead; a "version" ahead of the real file made the
# Android app download the same old APK over and over (fixed in v0.70.1).
$vn = [regex]::Match([System.IO.File]::ReadAllText("$proj\AndroidManifest.xml"), 'android:versionName="([^"]+)"').Groups[1].Value
if (-not $vn) { throw 'android:versionName not found in AndroidManifest.xml' }
$feed = "$web\version.json"
$utf8 = New-Object System.Text.UTF8Encoding($false)   # no BOM
$json = [System.IO.File]::ReadAllText($feed, $utf8)
$re = New-Object System.Text.RegularExpressions.Regex('"version"\s*:\s*"[^"]*"')
$json = $re.Replace($json, ('"version": "' + $vn + '"'), 1)
[System.IO.File]::WriteAllText($feed, $json, $utf8)
Write-Host "==> version.json APK channel -> $vn"

Write-Host "==> verify"
& "$bt\aapt.exe" dump badging $apkOut | Select-String -Pattern "^package|launchable-activity|uses-permission|sdkVersion"
Write-Host ("APK: $apkOut  " + [math]::Round((Get-Item $apkOut).Length / 1MB, 2) + " MB")
