# GuitarLab APK build — no Gradle, raw SDK toolchain.
# Pipeline: javac -> d8 (dex) -> aapt package (res + assets) -> zipalign -> apksigner.
$ErrorActionPreference = 'Stop'

$tools    = 'C:\Users\mrein\AndroidBuildTools'
$jdk      = "$tools\jdk-17.0.19+10"
$bt       = "$tools\sdk\build-tools\34.0.0"
$platform = "$tools\sdk\platforms\android-34\android.jar"
$proj     = $PSScriptRoot                 # android/ inside the repo
$web      = Split-Path $PSScriptRoot      # repo root = the web app
$apkOut   = "$web\releases\GuitarLab-alpha.apk"
$out      = "$proj\build"

$env:JAVA_HOME = $jdk   # d8.bat / apksigner.bat resolve java through JAVA_HOME

function Step($name, $block) {
    Write-Host "==> $name"
    & $block
    if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" }
}

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force "$out\obj", "$out\dex", "$out\assets" | Out-Null

# Bundle the web app as WebView assets (sw.js omitted — no service workers on file://).
Copy-Item "$web\index.html" "$out\assets\"
Copy-Item "$web\manifest.webmanifest" "$out\assets\"
Copy-Item -Recurse "$web\css", "$web\js", "$web\icons", "$web\fonts" "$out\assets\"

Step 'javac' { & "$jdk\bin\javac.exe" -source 8 -target 8 -nowarn -classpath $platform -d "$out\obj" "$proj\src\com\mreindl\guitarlab\MainActivity.java" }

$classes = (Get-ChildItem "$out\obj" -Recurse -Filter *.class).FullName
Step 'd8' { & "$bt\d8.bat" --release --lib $platform --output "$out\dex" @classes }

Step 'aapt package' { & "$bt\aapt.exe" package -f -M "$proj\AndroidManifest.xml" -S "$proj\res" -A "$out\assets" -I $platform -F "$out\unsigned.apk" }

Push-Location "$out\dex"
Step 'aapt add dex' { & "$bt\aapt.exe" add "$out\unsigned.apk" "classes.dex" }
Pop-Location

Step 'zipalign' { & "$bt\zipalign.exe" -f 4 "$out\unsigned.apk" "$out\aligned.apk" }

if (-not (Test-Path "$proj\guitarlab.keystore")) {
    Step 'keytool' { & "$jdk\bin\keytool.exe" -genkeypair -keystore "$proj\guitarlab.keystore" -alias guitarlab -keyalg RSA -keysize 2048 -validity 10000 -storepass guitarlab1 -keypass guitarlab1 -dname "CN=GuitarLab, O=mreindl" }
}

New-Item -ItemType Directory -Force (Split-Path $apkOut) | Out-Null
Step 'apksigner' { & "$bt\apksigner.bat" sign --ks "$proj\guitarlab.keystore" --ks-pass pass:guitarlab1 --key-pass pass:guitarlab1 --out $apkOut "$out\aligned.apk" }

Write-Host "==> verify"
& "$bt\aapt.exe" dump badging $apkOut | Select-String -Pattern "^package|launchable-activity|uses-permission|sdkVersion"
Write-Host ("APK: $apkOut  " + [math]::Round((Get-Item $apkOut).Length / 1MB, 2) + " MB")
