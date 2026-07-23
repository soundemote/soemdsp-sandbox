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
# Mirrors (add/update/remove) three things into $SiteRoot/public/soemdsp-sandbox:
#   - public/index.html               -> soemdsp-sandbox/index.html
#   - public/native-modules-catalog.json -> soemdsp-sandbox/native-modules-catalog.json
#   - native_modules/*/*.wasm         -> soemdsp-sandbox/native_modules/*/*.wasm  (compiled output only, no .cpp source)
#   - public/ (everything else)       -> soemdsp-sandbox/public/

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$srcPublic = Join-Path $root "public"
$srcNative = Join-Path $root "native_modules"

$siteRootResolved = Resolve-Path -LiteralPath $SiteRoot -ErrorAction SilentlyContinue
if (!$siteRootResolved) {
  throw "soundemote-site not found at $SiteRoot -- pass -SiteRoot <path> if it lives somewhere else."
}
$dst = Join-Path $siteRootResolved.Path "public\soemdsp-sandbox"
if (!(Test-Path -LiteralPath $dst)) {
  throw "Vendored copy not found at $dst -- expected an existing public/soemdsp-sandbox/ folder in soundemote-site."
}

Write-Host "Syncing $root -> $dst"

# --- top-level files ---
# index.html: fill the {{SANDBOX_VERSION}}/{{BUILD_NUMBER}} placeholders that
# server.py substitutes at runtime. The vendored site copy is served statically
# (no server.py), so without this it would show the literal placeholder text.
$versionFile = Join-Path $root "VERSION"
$sandboxVersion = if (Test-Path -LiteralPath $versionFile) { (Get-Content -LiteralPath $versionFile -Raw).Trim() } else { "0.0.0" }
$serverText = Get-Content -LiteralPath (Join-Path $root "server.py") -Raw
$buildNumber = if ($serverText -match 'BUILD_NUMBER\s*=\s*"([^"]*)"') { $Matches[1] } else { "" }
# Read index.html as UTF-8 explicitly. Get-Content -Raw in PS 5.1 reads with the
# ANSI codepage for BOM-less files, which mangles multibyte chars (middot, emoji)
# and produced double-encoded output when re-written as UTF-8. Read raw UTF-8 bytes.
$indexRaw = [System.IO.File]::ReadAllText((Join-Path $srcPublic "index.html"), [System.Text.Encoding]::UTF8)
$indexHtml = $indexRaw.Replace("{{SANDBOX_VERSION}}", $sandboxVersion).Replace("{{BUILD_NUMBER}}", $buildNumber)
[System.IO.File]::WriteAllText((Join-Path $dst "index.html"), $indexHtml, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  index.html (v$sandboxVersion, build $buildNumber -- placeholders filled)"
Copy-Item -LiteralPath (Join-Path $srcPublic "native-modules-catalog.json") -Destination (Join-Path $dst "native-modules-catalog.json") -Force

# --- native_modules/: mirror only *.wasm, matching the existing vendored pattern ---
$dstNative = Join-Path $dst "native_modules"
if (!(Test-Path -LiteralPath $dstNative)) { New-Item -ItemType Directory -Path $dstNative | Out-Null }

$srcModuleNames = @(Get-ChildItem -LiteralPath $srcNative -Directory | ForEach-Object { $_.Name })
$dstModuleNames = @(Get-ChildItem -LiteralPath $dstNative -Directory | ForEach-Object { $_.Name })

foreach ($name in $dstModuleNames) {
  if ($srcModuleNames -notcontains $name) {
    Remove-Item -LiteralPath (Join-Path $dstNative $name) -Recurse -Force
    Write-Host "  removed stale native_modules\$name"
  }
}

foreach ($name in $srcModuleNames) {
  $srcDir = Join-Path $srcNative $name
  $dstDir = Join-Path $dstNative $name
  if (!(Test-Path -LiteralPath $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }

  $srcWasm = @(Get-ChildItem -LiteralPath $srcDir -Filter "*.wasm" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
  $dstWasm = @(Get-ChildItem -LiteralPath $dstDir -Filter "*.wasm" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })

  foreach ($wasmName in $dstWasm) {
    if ($srcWasm -notcontains $wasmName) {
      Remove-Item -LiteralPath (Join-Path $dstDir $wasmName) -Force
    }
  }
  foreach ($wasmName in $srcWasm) {
    Copy-Item -LiteralPath (Join-Path $srcDir $wasmName) -Destination (Join-Path $dstDir $wasmName) -Force
  }
}

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
