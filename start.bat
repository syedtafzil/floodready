@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo             Starting FloodReady App
echo ===================================================

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Detected Node.js. Starting server...
    start http://localhost:3000
    node server.js
) else (
    echo Starting server with native Windows PowerShell...
    start http://localhost:3000
    powershell -NoProfile -ExecutionPolicy Bypass -File server.ps1
)
pause
