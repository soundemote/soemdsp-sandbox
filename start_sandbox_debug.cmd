@echo off
setlocal enabledelayedexpansion

:: ── Debug sandbox launcher ──
:: Starts everything soemdsp-sandbox needs for local dev, in DEBUG mode
:: (BUILD_MODE=debug, the server.py default -- the debug console's bug
:: button renders red; see node-graph-debug-console.js). Always runs the
:: latest code. Replaces both the old start_sandbox.cmd (identical
:: fresh-restart flow) and start_sandbox.ps1 (folded in below: the CLAP
:: plugin host companion process, started idempotently -- skipped if a copy
:: is already running, matching start_sandbox.ps1's original behavior --
:: since restarting that process is disruptive/slow, unlike the cheap sandbox
:: web server restart below).
:: See start_sandbox_release.cmd for the release counterpart, which also
:: rebuilds native modules, runs the smoke test, and refreshes the copy
:: embedded in soundemote-site.

set "REPO=%~dp0"
cd /d "%REPO%"

echo === Soemdsp Sandbox (DEBUG build) ===
echo.

:: Warn if any native module source is newer than the combined wasm the
:: live worklet actually runs -- otherwise an edited .cpp silently keeps
:: running old native code until scripts\build_native_modules.ps1 is rerun.
powershell -NoProfile -Command ^
  "$w = Get-Item 'native_modules\combined\soemdsp_combined.wasm' -ErrorAction SilentlyContinue;" ^
  "$c = Get-ChildItem 'native_modules\*\*.cpp' | Sort-Object LastWriteTime -Descending | Select-Object -First 1;" ^
  "if (-not $w) { Write-Host 'WARNING: combined native wasm missing -- run scripts\build_native_modules.ps1' -ForegroundColor Yellow }" ^
  "elseif ($c -and $c.LastWriteTime -gt $w.LastWriteTime) { Write-Host ('WARNING: ' + $c.Name + ' is newer than the combined native wasm -- run scripts\build_native_modules.ps1 or native modules run STALE code') -ForegroundColor Yellow }"

:: [1/4] CLAP plugin host companion process. Idempotent: if it's already
:: running (e.g. from a previous run of this script, or a manual start), skip
:: it rather than killing/relaunching. Fire-and-forget -- unlike the sandbox
:: server below, we don't block waiting for it to come up; if it fails, that
:: shows up in its own console window, and CLAP Plugin modules will just
:: show "Not Running" in the sandbox until it's up.
echo [1/4] Checking CLAP plugin host (port 47991)...
set "CLAP_PID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":47991.*LISTENING" 2^>nul') do set "CLAP_PID=%%a"
if defined CLAP_PID (
    echo       Already running ^(PID !CLAP_PID!^) -- not starting another copy.
) else (
    echo       Starting local CLAP plugin host...
    start "CLAP Plugin Host" /D "%REPO%" powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%REPO%tools\webui-clap-host\start_webui_clap_host.ps1' -Port 47991; Read-Host 'Press Enter to close'"
)

:: Kill any existing python process on port 8765 (the sandbox server itself
:: IS cheap to restart, and we always want it running the latest code, so
:: this one force-restarts rather than skipping like the CLAP host above).
echo [2/4] Stopping existing sandbox server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
    echo       Killed stale process PID %%a
)
timeout /t 1 /nobreak >nul

:: Start fresh, serving BUILD_MODE=debug (the default -- no --release flag)
echo [3/4] Starting sandbox server (debug)...
start "Soemdsp Sandbox (Debug)" /D "%REPO%" powershell -NoProfile -ExecutionPolicy Bypass -Command "python server.py --host 127.0.0.1 --port 8765; Read-Host 'Press Enter to close'"

:: Wait for it to be ready
echo [4/4] Waiting for server...
:wait
timeout /t 1 /nobreak >nul
curl -s -o nul http://127.0.0.1:8765/ 2>nul
if errorlevel 1 goto wait

echo       Server ready.
start http://127.0.0.1:8765/
echo.
echo Sandbox is running in DEBUG mode. Close the PowerShell window to stop it.
echo (CLAP plugin host, if started above, runs in its own window separately.)
exit /b 0
