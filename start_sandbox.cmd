@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_sandbox.ps1" %*
exit /b %ERRORLEVEL%
