@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo  soemdsp — generate Visual Studio project/solution
echo ============================================================
echo.
echo  Production WASM builds remain:
echo    powershell -File scripts\build_native_modules.ps1
echo.
echo  This script only generates a VS solution for editing /
echo  IntelliSense / compiling what MSVC can host. WASM SIMD and
echo  memory.grow paths use stubs under cmake\msvc_compat\.
echo ============================================================
echo.

where cmake >nul 2>&1
if errorlevel 1 (
  echo ERROR: cmake not found on PATH.
  echo Install CMake from https://cmake.org/download/ or add it to PATH.
  exit /b 1
)

set "BUILD_DIR=%~dp0build_vs"
set "GEN="

REM Fresh configure tree so a failed generator cannot poison the next try.
if exist "%BUILD_DIR%\CMakeCache.txt" del /f /q "%BUILD_DIR%\CMakeCache.txt" >nul 2>&1
if exist "%BUILD_DIR%\CMakeFiles" rd /s /q "%BUILD_DIR%\CMakeFiles" >nul 2>&1

echo Trying generator: Visual Studio 17 2022 (x64)...
cmake -G "Visual Studio 17 2022" -A x64 -S "%~dp0." -B "%BUILD_DIR%"
if not errorlevel 1 (
  set "GEN=Visual Studio 17 2022"
  goto :success
)

echo.
echo VS 2022 unavailable — clearing cache and trying Visual Studio 16 2019...
if exist "%BUILD_DIR%\CMakeCache.txt" del /f /q "%BUILD_DIR%\CMakeCache.txt" >nul 2>&1
if exist "%BUILD_DIR%\CMakeFiles" rd /s /q "%BUILD_DIR%\CMakeFiles" >nul 2>&1
cmake -G "Visual Studio 16 2019" -A x64 -S "%~dp0." -B "%BUILD_DIR%"
if not errorlevel 1 (
  set "GEN=Visual Studio 16 2019"
  goto :success
)

echo.
echo VS 2019 unavailable — clearing cache and trying CMake default generator...
if exist "%BUILD_DIR%\CMakeCache.txt" del /f /q "%BUILD_DIR%\CMakeCache.txt" >nul 2>&1
if exist "%BUILD_DIR%\CMakeFiles" rd /s /q "%BUILD_DIR%\CMakeFiles" >nul 2>&1
cmake -S "%~dp0." -B "%BUILD_DIR%"
if errorlevel 1 (
  echo.
  echo ERROR: cmake configure failed for all attempted generators.
  echo Install Visual Studio 2022 with "Desktop development with C++"
  echo (Community/Pro) or Build Tools + MSVC workload, then re-run.
  exit /b 1
)
set "GEN=(CMake default)"

:success
echo.
echo ------------------------------------------------------------
echo  Generator : %GEN%
echo  Build dir : %BUILD_DIR%
echo  Solution  : %BUILD_DIR%\soemdsp.sln
echo ------------------------------------------------------------
echo.
echo  Open:
echo    start "" "%BUILD_DIR%\soemdsp.sln"
echo.
echo  Targets of interest:
echo    - sandbox_native_maths_headers  (maths .h browsing)
echo    - ^<module_name^>         (one STATIC lib per native_modules/*/ )
echo    - soemdsp_all_modules    (build every module lib)
echo    - soemdsp_vs_readme      (caveats text in the solution)
echo.
echo  Caveats: build_vs\SOEMDSP_VS_README.txt
echo    - WASM SIMD / memory.grow use scalar stubs (not production audio)
echo    - graph_engine: browse/IntelliSense only under MSVC (C1061 nest limit)
echo.

if exist "%BUILD_DIR%\soemdsp.sln" (
  echo SUCCESS: %BUILD_DIR%\soemdsp.sln
  exit /b 0
)

echo WARNING: soemdsp.sln not found — generator may not be a multi-config
echo Visual Studio generator. Inspect files under %BUILD_DIR%.
exit /b 0
