@echo off
setlocal enabledelayedexpansion

:: ── Full release pipeline ──
:: 1) Builds native wasm modules, regenerates the module catalog, runs the
::    smoke test, and syncs the release copy into soundemote-site. Reuses
::    ..\launch_soundemote_site_with_sandbox.ps1 -PrepareOnly for this step --
::    same tested pipeline that script already runs, just stopped short of
::    launching soundemote-site's dev server (we do that ourselves below, so
::    it runs alongside the local sandbox server instead of blocking this
::    window).
:: 2) Starts THIS local sandbox server in RELEASE mode (BUILD_MODE=release --
::    the debug console's bug button renders neutral instead of red; see
::    node-graph-debug-console.js).
:: 3) Launches soundemote-site's own npm dev server in its own window.
::
:: You end up with two windows: the local sandbox (port 8765, this repo's
:: own server.py), and soundemote-site's dev server (port 8080) -- both
:: serving/backing the same just-synced release copy.
::
:: Extra args are passed through to launch_soundemote_site_with_sandbox.ps1's
:: prepare step, e.g.:  start_sandbox_release.cmd -SkipNativeBuild -SkipSmoke
::
:: See start_sandbox_debug.cmd for the plain local-debug counterpart (no
:: build/smoke-test/sync/soundemote-site involved at all).

set "REPO=%~dp0"
cd /d "%REPO%"
set "SITE_PORT=8080"

echo === Soemdsp Sandbox (RELEASE build) -- full pipeline ===
echo.

if not exist "%REPO%..\launch_soundemote_site_with_sandbox.ps1" (
    echo ERROR: ..\launch_soundemote_site_with_sandbox.ps1 not found next to this repo.
    echo        Expected soemdsp-sandbox and soundemote-site to be sibling folders under _PROGRAMMING.
    exit /b 1
)
if not exist "%REPO%..\soundemote-site" (
    echo ERROR: ..\soundemote-site not found next to this repo -- cannot run the full pipeline.
    echo        Use start_sandbox_debug.cmd, or check out soundemote-site as a sibling folder.
    exit /b 1
)

:: [1/4] Build native modules, regenerate catalog, run smoke test, sync into
:: soundemote-site. -PrepareOnly stops there instead of also launching
:: soundemote-site's dev server (see step [4/4] below).
echo [1/4] Running build + smoke test + soundemote-site sync pipeline...
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%..\launch_soundemote_site_with_sandbox.ps1" -PrepareOnly %*
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
:: whatever's holding the soundemote-site dev port, so the launches below
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

:: Launch soundemote-site's dev server in its own window, alongside the
:: local sandbox above, instead of blocking this window.
echo [4/4] Launching soundemote-site dev server (port %SITE_PORT%)...
start "Soundemote Site" /D "%REPO%..\soundemote-site" powershell -NoProfile -ExecutionPolicy Bypass -Command "npm run dev -- --host 0.0.0.0 --port %SITE_PORT%; Read-Host 'Press Enter to close'"

start http://127.0.0.1:8765/
start http://localhost:%SITE_PORT%/

echo.
echo Two windows are starting:
echo   Local sandbox (release):                   http://127.0.0.1:8765/
echo   soundemote-site:                            http://localhost:%SITE_PORT%/
echo Close each PowerShell window to stop that process.
exit /b 0
