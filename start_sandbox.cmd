@echo off
setlocal

:: ── Fresh sandbox launcher ──
:: Kills any existing sandbox server, then starts a clean instance
:: from the repo directory. Always runs the latest code.

set "REPO=%~dp0"
cd /d "%REPO%"

echo === Soemdsp Sandbox ===
echo.

:: Warn if any native module source is newer than the combined wasm the
:: live worklet actually runs -- otherwise an edited .cpp silently keeps
:: running old native code until scripts\build_native_modules.ps1 is rerun.
powershell -NoProfile -Command ^
  "$w = Get-Item 'native_modules\combined\soemdsp_combined.wasm' -ErrorAction SilentlyContinue;" ^
  "$c = Get-ChildItem 'native_modules\*\*.cpp' | Sort-Object LastWriteTime -Descending | Select-Object -First 1;" ^
  "if (-not $w) { Write-Host 'WARNING: combined native wasm missing -- run scripts\build_native_modules.ps1' -ForegroundColor Yellow }" ^
  "elseif ($c -and $c.LastWriteTime -gt $w.LastWriteTime) { Write-Host ('WARNING: ' + $c.Name + ' is newer than the combined native wasm -- run scripts\build_native_modules.ps1 or native modules run STALE code') -ForegroundColor Yellow }"

:: Kill any existing python processes on port 8765
echo [1/3] Stopping existing server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
    echo       Killed stale process PID %%a
)
timeout /t 1 /nobreak >nul

:: Start fresh
echo [2/3] Starting sandbox server...
start "Soemdsp Sandbox" /D "%REPO%" powershell -NoProfile -ExecutionPolicy Bypass -Command "python server.py --host 127.0.0.1 --port 8765; Read-Host 'Press Enter to close'"

:: Wait for it to be ready
echo [3/3] Waiting for server...
:wait
timeout /t 1 /nobreak >nul
curl -s -o nul http://127.0.0.1:8765/ 2>nul
if errorlevel 1 goto wait

echo       Server ready.
start http://127.0.0.1:8765/
echo.
echo Sandbox is running. Close the PowerShell window to stop it.
exit /b 0
