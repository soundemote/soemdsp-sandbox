@echo off
setlocal enabledelayedexpansion

:: ── Full release pipeline ──
:: 1) Builds native wasm modules, regenerates the module catalog, runs the
::    smoke test, and syncs the release copy into soundemote-io. Reuses
::    ..\launch_soundemote_io_with_sandbox.ps1 -PrepareOnly for this step --
::    same tested pipeline that script already runs, just stopped short of
::    launching soundemote-io's dev server (we do that ourselves below, so
::    it runs alongside the local sandbox server instead of blocking this
::    window).
:: 2) Starts THIS local sandbox server in RELEASE mode (BUILD_MODE=release --
::    bug button neutral; boot OS/GPU/RAM sysinfo hidden; START SANDBOX gate
::    still required before deferred scripts load).
:: 3) Launches soundemote-io's own npm dev server in its own window.
::    Sync hardcodes BUILD_MODE=release into the vendored site copy, omits
::    personal useruisettings / examples / workbenches, and writes
::    RELEASE_MANIFEST.json (wasm sha256) for deploy review.
::
:: You end up with two windows: the local sandbox (port 8765, this repo's
:: own server.py), and soundemote-io's dev server (port 8080) -- both
:: serving/backing the same just-synced release copy.
::
:: Extra args are passed through to launch_soundemote_io_with_sandbox.ps1's
:: prepare step, e.g.:  start_sandbox_release.cmd -SkipNativeBuild -SkipSmoke
::
:: See start_sandbox_debug.cmd for the plain local-debug counterpart (no
:: build/smoke-test/sync/soundemote-io involved at all).

set "REPO=%~dp0"
cd /d "%REPO%"
set "SITE_PORT=8080"

echo === Soemdsp Sandbox (RELEASE build) -- full pipeline ===
echo.

if not exist "%REPO%..\launch_soundemote_io_with_sandbox.ps1" (
    echo ERROR: ..\launch_soundemote_io_with_sandbox.ps1 not found next to this repo.
    echo        Expected soemdsp-sandbox and soundemote-io to be sibling folders under _PROGRAMMING.
    exit /b 1
)
if not exist "%REPO%..\soundemote-io" (
    echo ERROR: ..\soundemote-io not found next to this repo -- cannot run the full pipeline.
    echo        Use start_sandbox_debug.cmd, or check out soundemote-io as a sibling folder.
    exit /b 1
)

:: [1/4] Build native modules, regenerate catalog, run smoke test, sync into
:: soundemote-io. -PrepareOnly stops there instead of also launching
:: soundemote-io's dev server (see step [4/4] below).
echo [1/4] Running build + smoke test + soundemote-io sync pipeline...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%..\launch_soundemote_io_with_sandbox.ps1" -PrepareOnly %*
if errorlevel 1 (
    echo.
    echo ERROR: pipeline failed -- see errors above. Not starting any servers.
    echo.
    echo Tip: re-run from a kept-open terminal:
    echo   cd /d "%REPO%"
    echo   start_sandbox_release.cmd
    echo Or skip build/smoke for a quick launch:
    echo   start_sandbox_release.cmd -SkipNativeBuild -SkipSmoke
    echo.
    pause
    exit /b 1
)
echo.

:: Kill any existing python process on port 8765 (local sandbox) and
:: whatever's holding the soundemote-io dev port, so the launches below
:: don't fail because a previous run is still holding either one.
echo [2/4] Stopping existing local sandbox / site dev servers...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
    echo       Killed stale process PID %%a on 8765
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%SITE_PORT%.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
    echo       Killed stale process PID %%a on %SITE_PORT%
)
timeout /t 1 /nobreak >nul

:: Start the local sandbox server, in RELEASE mode
echo [3/4] Starting local sandbox server (release, port 8765)...
start "Soemdsp Sandbox (Release)" /D "%REPO%" powershell -NoProfile -ExecutionPolicy Bypass -Command "python server.py --host 127.0.0.1 --port 8765 --release; Read-Host 'Press Enter to close'"

:wait8765
timeout /t 1 /nobreak >nul
curl -s -o nul http://127.0.0.1:8765/ 2>nul
if errorlevel 1 goto wait8765
echo       Local sandbox ready at http://127.0.0.1:8765/

:: Launch soundemote-io's dev server in its own window, alongside the
:: local sandbox above, instead of blocking this window.
echo [4/4] Launching soundemote-io dev server (port %SITE_PORT%)...
start "Soundemote IO" /D "%REPO%..\soundemote-io" powershell -NoProfile -ExecutionPolicy Bypass -Command "npm run dev -- --host 0.0.0.0 --port %SITE_PORT%; Read-Host 'Press Enter to close'"

start http://127.0.0.1:8765/
start http://localhost:%SITE_PORT%/

echo.
echo Two windows are starting:
echo   Local sandbox (release):                   http://127.0.0.1:8765/
echo   soundemote-io:                            http://localhost:%SITE_PORT%/
echo Close each PowerShell window to stop that process.
exit /b 0
