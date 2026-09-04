param(
  [string]$SiteRoot = (Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) "..\soundemote-site")
)

$ErrorActionPreference = "Stop"

# soundemote-site embeds a vendored, hand-copied snapshot of this app under
# public/soemdsp-sandbox/ (served via iframe, see src/pages/SandboxPage.tsx
# -> sandboxIframeSrc -> "/soemdsp-sandbox/index.html"). There is no build
# step wiring the two repos together, so that snapshot silently rots every
# time a module is added/changed here unless someone remembers to re-copy it
# by hand. This script is that copy step, made repeatable.
#
# Wipes $SiteRoot/public/soemdsp-sandbox entirely and rebuilds it from
# scratch every run (see the wipe step below) -- no partial/incremental
# carry-over, so a missing or renamed asset 404s on the live site instead of
# silently falling back to whatever an old sync happened to leave behind.
# Recreates three things into $SiteRoot/public/soemdsp-sandbox:
#   - public/index.html               -> soemdsp-sandbox/index.html
#   - public/native-modules-catalog.json -> soemdsp-sandbox/native-modules-catalog.json
#   - native_modules/combined/soemdsp_combined.wasm -> soemdsp-sandbox/native_modules/combined/soemdsp_combined.wasm
#     (see wasm-memory-cap notes: the live worklet loads this single combined
#     binary and no longer needs the ~78 individual per-module .wasm files at
#     runtime. Those per-module .wasm files ARE still built locally -- for
#     self-test/demos, and as an in-process fallback path if the combined
#     binary ever fails to load -- but are deliberately NOT vendored here.
#     Shipping all of them again risks re-tripping the same Chrome
#     per-process wasm-memory cap that motivated combining them in the first
#     place if that fallback path ever activates broadly on the public site.)
#   - public/ (everything else)       -> soemdsp-sandbox/public/

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$srcPublic = Join-Path $root "public"
$srcNative = Join-Path $root "native_modules"

$siteRootResolved = Resolve-Path -LiteralPath $SiteRoot -ErrorAction SilentlyContinue
if (!$siteRootResolved) {
  throw "soundemote-site not found at $SiteRoot -- pass -SiteRoot <path> if it lives somewhere else."
}
$dst = Join-Path $siteRootResolved.Path "public\soemdsp-sandbox"

# Wipe the entire vendored copy and recreate it empty before syncing anything
# in. Every file below is deterministically re-derived from this repo's
# public/ and native_modules/combined/, so there is no reason for a stale
# file from a previous sync (a retired module's per-module .wasm, a renamed
# asset, anything) to ever survive into the next deploy. This is deliberate:
# we want a missing/broken asset on the live site to fail loudly (404) rather
# than silently serve some leftover file from an old sync -- see the
# native_modules trim in wasm-memory-cap notes for the specific case (stale
# per-module .wasm files acting as an unwanted fallback) this generalizes.
if (Test-Path -LiteralPath $dst) {
  Write-Host "Removing existing vendored copy at $dst"
  Remove-Item -LiteralPath $dst -Recurse -Force
}
New-Item -ItemType Directory -Path $dst | Out-Null

Write-Host "Syncing $root -> $dst"

# --- top-level files ---
# index.html: fill the {{SANDBOX_VERSION}}/{{BUILD_NUMBER}}/{{BUILD_MODE}}
# placeholders that server.py substitutes at runtime. The vendored site copy
# is served statically (no server.py), so without this it would show the
# literal placeholder text -- and, for BUILD_MODE specifically, the debug
# console's bug button would fall back to its "debug" (red) styling on a
# public page (see seBuildMode() in node-graph-debug-console.js), which is
# wrong for a copy that only ever ships to soundemote-site. Anything vendored
# here IS the release copy by definition, so BUILD_MODE is always hardcoded
# to "release", independent of what mode the local sandbox server.py happens
# to be running in when this script is invoked.
$versionFile = Join-Path $root "VERSION"
$sandboxVersion = if (Test-Path -LiteralPath $versionFile) { (Get-Content -LiteralPath $versionFile -Raw).Trim() } else { "0.0.0" }
$serverText = Get-Content -LiteralPath (Join-Path $root "server.py") -Raw
$buildNumber = if ($serverText -match 'BUILD_NUMBER\s*=\s*"([^"]*)"') { $Matches[1] } else { "" }
$buildMode = "release"
# Read index.html as UTF-8 explicitly. Get-Content -Raw in PS 5.1 reads with the
# ANSI codepage for BOM-less files, which mangles multibyte chars (middot, emoji)
# and produced double-encoded output when re-written as UTF-8. Read raw UTF-8 bytes.
$indexRaw = [System.IO.File]::ReadAllText((Join-Path $srcPublic "index.html"), [System.Text.Encoding]::UTF8)
$buildToken = ($sandboxVersion -replace "[^A-Za-z0-9]", "").ToUpper()
if ($buildToken.Length -gt 4) { $buildToken = $buildToken.Substring(0, 4) }
if (-not $buildToken) { $buildToken = "LIVE" }
$indexHtml = $indexRaw.Replace("{{SANDBOX_VERSION}}", $sandboxVersion).Replace("{{BUILD_NUMBER}}", $buildNumber).Replace("{{BUILD_MODE}}", $buildMode).Replace("{{BUILD_TOKEN}}", $buildToken)
# Drop debug-only deferred script tags from the static release shell so START
# does not fetch evidence/debug chrome. Keep node-graph-debug-console.js (bug
# button stays available; release only changes its color via BUILD_MODE).
# Keep release-debug-stubs.js — it supplies no-ops for omitted APIs so core
# boot (selection / manifest / live bindings) never ReferenceErrors.
$releaseOmitScriptSubstrings = @(
  "node-graph-execution-debug-api.js",
  "node-graph-execution-debug-view.js",
  "node-graph-debug-copy.js",
  "legacy-evidence-checklist-view.js",
  "legacy-evidence-proof-view.js",
  "legacy-evidence-views.js",
  "hands-on-readiness-waveform-labels.js",
  "hands-on-readiness-primary-labels.js",
  "hands-on-readiness-artifact-labels.js",
  "hands-on-readiness-signal-inspection-labels.js",
  "hands-on-readiness-phase-parameter-labels.js",
  "hands-on-readiness-probe-labels.js",
  "hands-on-readiness.js",
  "artifact-report-utils.js",
  "artifact-report-reports.js",
  "artifact-list-view.js",
  "artifact-coverage-view.js",
  "manifest-source-view.js",
  "legacy-evidence"
)
$omitCount = 0
$indexHtml = [regex]::Replace($indexHtml, '<script\b[^>]*>\s*</script>\s*', {
  param($m)
  $tag = $m.Value
  foreach ($frag in $releaseOmitScriptSubstrings) {
    if ($tag -like "*$frag*") {
      $script:omitCount++
      return ""
    }
  }
  return $tag
})
[System.IO.File]::WriteAllText((Join-Path $dst "index.html"), $indexHtml, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  index.html (v$sandboxVersion, build $buildNumber, mode $buildMode -- placeholders filled; omitted $omitCount debug script tags)"
Copy-Item -LiteralPath (Join-Path $srcPublic "native-modules-catalog.json") -Destination (Join-Path $dst "native-modules-catalog.json") -Force

# --- native_modules/: mirror ONLY the combined binary, not the ~78 individual
# per-module .wasm files. The live worklet loads native_modules/combined/
# soemdsp_combined.wasm as its single instance; shipping every per-module
# .wasm too was leftover from before the combine step existed. $dst was just
# wiped above, so there's nothing stale to sweep here anymore -- this just
# creates native_modules/combined/ fresh and copies the one file in.
#
# IMPORTANT: load mode must be combined (or slim-with-combined-fallback).
# ?wasmLoad=slim alone will 404 per-module URLs and silence native-only
# modules (e.g. crossover) unless runtime falls back to this combined file.
$dstNative = Join-Path $dst "native_modules"
if (!(Test-Path -LiteralPath $dstNative)) { New-Item -ItemType Directory -Path $dstNative | Out-Null }

$srcCombinedWasm = Join-Path $srcNative "combined\soemdsp_combined.wasm"
if (!(Test-Path -LiteralPath $srcCombinedWasm)) {
  throw "Combined wasm not found at $srcCombinedWasm -- run scripts\build_native_modules.ps1 first."
}
$dstCombinedDir = Join-Path $dstNative "combined"
if (!(Test-Path -LiteralPath $dstCombinedDir)) { New-Item -ItemType Directory -Path $dstCombinedDir | Out-Null }
Copy-Item -LiteralPath $srcCombinedWasm -Destination (Join-Path $dstCombinedDir "soemdsp_combined.wasm") -Force
Write-Host "  native_modules\combined\soemdsp_combined.wasm"

# --- public/: mirror for release embed ---
# Always omit local-dev / personal / example trees. The site copy is release-only.
$excludeTop = @(
  "index.html",
  "native-modules-catalog.json",
  "examples",       # local HTML demos
  "workbenches"     # experimental local benches
)
$dstPublic = Join-Path $dst "public"

function Sync-Dir([string]$SrcDir, [string]$DstDir, [string[]]$ExcludeNames = @()) {
  if (!(Test-Path -LiteralPath $DstDir)) { New-Item -ItemType Directory -Path $DstDir | Out-Null }

  $srcEntries = @(Get-ChildItem -LiteralPath $SrcDir -Force | Where-Object { $ExcludeNames -notcontains $_.Name })
  $dstEntries = @(Get-ChildItem -LiteralPath $DstDir -Force | Where-Object { $ExcludeNames -notcontains $_.Name })

  $srcNames = @($srcEntries | ForEach-Object { $_.Name })
  foreach ($entry in $dstEntries) {
    if ($srcNames -notcontains $entry.Name) {
      Remove-Item -LiteralPath $entry.FullName -Recurse -Force
      Write-Host "  removed stale $($entry.FullName.Substring($dst.Length + 1))"
    }
  }

  foreach ($entry in $srcEntries) {
    $dstPath = Join-Path $DstDir $entry.Name
    if ($entry.PSIsContainer) {
      Sync-Dir -SrcDir $entry.FullName -DstDir $dstPath
    } else {
      # Never ship source maps or editor junk into the public embed.
      if ($entry.Extension -in @(".map", ".tmp", ".bak")) { continue }
      $needsCopy = $true
      if (Test-Path -LiteralPath $dstPath) {
        $dstItem = Get-Item -LiteralPath $dstPath
        if ($dstItem.Length -eq $entry.Length -and $dstItem.LastWriteTimeUtc -ge $entry.LastWriteTimeUtc) {
          $needsCopy = $false
        }
      }
      if ($needsCopy) {
        Copy-Item -LiteralPath $entry.FullName -Destination $dstPath -Force
      }
    }
  }
}

Sync-Dir -SrcDir $srcPublic -DstDir $dstPublic -ExcludeNames $excludeTop

# Page patches live at repo-root patches/ and ship next to the embed so URLs
# are /soemdsp-sandbox/patches/{slug}.json (same path locally and on soundemote.io).
$srcPatches = Join-Path $root "patches"
$dstPatches = Join-Path $dst "patches"
if (!(Test-Path -LiteralPath $srcPatches)) {
  throw "Missing patches/ at $srcPatches -- page routes need static JSON here."
}
if (Test-Path -LiteralPath $dstPatches) {
  Remove-Item -LiteralPath $dstPatches -Recurse -Force
}
New-Item -ItemType Directory -Path $dstPatches | Out-Null
Copy-Item -Path (Join-Path $srcPatches "*") -Destination $dstPatches -Recurse -Force
$patchCount = @(Get-ChildItem -LiteralPath $dstPatches -Filter "*.json" -File).Count
Write-Host "  patches\ ($patchCount json files)"
if (!(Test-Path -LiteralPath (Join-Path $dstPatches "init.json"))) {
  throw "Release patches missing init.json"
}
if (!(Test-Path -LiteralPath (Join-Path $dstPatches "index.json"))) {
  throw "Release patches missing index.json (Pages picker catalog)"
}

# Personal UI prefs must not ship. Rebuild bundled defaults from the template.
$presetsDir = Join-Path $dstPublic "presets"
$defaultUiTemplate = Join-Path $srcPublic "presets\useruisettings.default.json"
if (!(Test-Path -LiteralPath $defaultUiTemplate)) {
  throw "Missing public/presets/useruisettings.default.json -- cannot build release UI settings."
}
$defaultUiJson = [System.IO.File]::ReadAllText($defaultUiTemplate, [System.Text.Encoding]::UTF8)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $presetsDir "useruisettings.default.json"), $defaultUiJson, $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $presetsDir "useruisettings.json"), $defaultUiJson, $utf8NoBom)
$bundledJs = @"
(function (settings) {
  window.nodeUiDevBundledDefaultSettings = settings;
  document.documentElement.dataset.nodeUiDevBundledDefaultSettings = JSON.stringify(settings);
})($defaultUiJson);
"@
[System.IO.File]::WriteAllText((Join-Path $presetsDir "useruisettings.js"), $bundledJs, $utf8NoBom)
Write-Host "  presets/useruisettings.* rebuilt from default template (personal prefs not shipped)"

# --- Release tree integrity (fail loud before site deploy) ---
$dstIndex = Join-Path $dst "index.html"
$dstIndexText = [System.IO.File]::ReadAllText($dstIndex, [System.Text.Encoding]::UTF8)
$dstWasm = Join-Path $dstCombinedDir "soemdsp_combined.wasm"
$wasmBytes = [System.IO.File]::ReadAllBytes($dstWasm)
if ($wasmBytes.Length -lt 100000) {
  throw "Release combined wasm looks too small ($($wasmBytes.Length) bytes)."
}
if ($wasmBytes[0] -ne 0 -or [char]$wasmBytes[1] -ne 'a' -or [char]$wasmBytes[2] -ne 's' -or [char]$wasmBytes[3] -ne 'm') {
  throw "Release combined wasm missing \0asm magic."
}
foreach ($needle in @("{{SANDBOX_VERSION}}", "{{BUILD_NUMBER}}", "{{BUILD_MODE}}", "{{BUILD_TOKEN}}")) {
  if ($dstIndexText.Contains($needle)) {
    throw "Release index still contains unsubstituted placeholder $needle"
  }
}
if ($dstIndexText -notmatch 'data-build-mode-value="release"') {
  throw "Release index missing data-build-mode-value=`"release`""
}
if ($dstIndexText -notmatch "START SANDBOX") {
  throw "Release index missing START SANDBOX boot gate"
}
if ($dstIndexText -notmatch "data-boot-defer") {
  throw "Release index missing data-boot-defer script gate (would auto-load everything)"
}
$forbiddenTwinGlobs = @(
  (Join-Path $dstPublic "modules\pingPongDelay\*-live-evaluator.js"),
  (Join-Path $dstPublic "modules\pingPongDelay\*-worklet-evaluator.js")
)
foreach ($glob in $forbiddenTwinGlobs) {
  $hits = @(Get-Item -Path $glob -ErrorAction SilentlyContinue)
  if ($hits.Count -gt 0) {
    throw "Release tree still contains nuked JS twin: $($hits[0].FullName)"
  }
}
if (Test-Path -LiteralPath (Join-Path $dstPublic "examples")) {
  throw "Release tree must not include public/examples"
}
if (Test-Path -LiteralPath (Join-Path $dstPublic "workbenches")) {
  throw "Release tree must not include public/workbenches"
}
# Core boot calls debug/evidence APIs; stubs must ship so release never ReferenceErrors.
if ($dstIndexText -notmatch "release-debug-stubs\.js") {
  throw "Release index missing release-debug-stubs.js (required no-ops for omitted debug scripts)"
}
if (!(Test-Path -LiteralPath (Join-Path $dstPublic "release-debug-stubs.js"))) {
  throw "Release public/ missing release-debug-stubs.js"
}
if ($dstIndexText -match "node-graph-execution-debug-view\.js") {
  throw "Release index still includes omitted node-graph-execution-debug-view.js"
}

# SHA-256 of the shipped wasm for deploy review / drift checks.
$sha = [System.BitConverter]::ToString(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash($wasmBytes)
).Replace("-", "").ToLowerInvariant()
$manifest = @{
  kind = "soemdsp-sandbox-release-tree"
  version = 1
  sandboxVersion = $sandboxVersion
  buildNumber = $buildNumber
  buildMode = $buildMode
  buildToken = $buildToken
  combinedWasmBytes = $wasmBytes.Length
  combinedWasmSha256 = $sha
  syncedUtc = [DateTime]::UtcNow.ToString("o")
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $dst "RELEASE_MANIFEST.json"), $manifest + "`n", $utf8NoBom)
Write-Host "  RELEASE_MANIFEST.json (wasm sha256=$sha)"

Write-Host "Release sync OK (BUILD_MODE=release, START gate present, personal prefs omitted)."
Write-Host "Review with: git -C `"$($siteRootResolved.Path)`" status, then commit + push from soundemote-site."
