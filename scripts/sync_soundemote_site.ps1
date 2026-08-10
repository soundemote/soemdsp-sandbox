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
$indexHtml = $indexRaw.Replace("{{SANDBOX_VERSION}}", $sandboxVersion).Replace("{{BUILD_NUMBER}}", $buildNumber).Replace("{{BUILD_MODE}}", $buildMode)
[System.IO.File]::WriteAllText((Join-Path $dst "index.html"), $indexHtml, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  index.html (v$sandboxVersion, build $buildNumber, mode $buildMode -- placeholders filled)"
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

# --- public/: full mirror, excluding the two files already handled above ---
$excludeTop = @("index.html", "native-modules-catalog.json")
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

Write-Host "Sync complete."
Write-Host "Review with: git -C `"$($siteRootResolved.Path)`" status, then commit + push from soundemote-site."
