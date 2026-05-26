@echo off
title iDeer Image Tool - Local Server Launcher

echo ======================================================================
echo             iDeer Image Processing Tool - Server Launcher
echo ======================================================================
echo.
echo Info:
echo Due to browser security policies (CORS), front-end AI tools using WASM
echo cannot run directly via double-clicking index.html (file:// protocol).
echo.
echo We will launch a lightweight local HTTP server for you...
echo ----------------------------------------------------------------------
echo.

:: 1. Try Node.js (npx)
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [DETECTED] Node.js environment!
    echo Starting http-server on port 8080...
    echo.
    start "" "http://localhost:8080"
    npx -y http-server -p 8080
    goto end
)

:: 2. Try Python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [DETECTED] Python environment!
    echo Starting python http.server on port 8000...
    echo.
    start "" "http://localhost:8000"
    python -m http.server 8000
    goto end
)

:: 3. Neither detected
echo ======================================================================
echo ERROR: Neither Node.js nor Python was detected on your system!
echo ======================================================================
echo.
echo Browser security policies block WebAssembly under the file:// protocol.
echo.
echo Recommended Solutions:
echo 1. If using VS Code, right-click index.html and select "Open with Live Server".
echo 2. Install Node.js (https://nodejs.org) or Python, then double-click this .bat again.
echo.
pause

:end
