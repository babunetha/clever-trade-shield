@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================
echo   Clever Trade Shield - Local Launcher
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js LTS from https://nodejs.org/
  echo Then double-click this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies for the first run...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Please send the error shown above.
    pause
    exit /b 1
  )
)

echo Starting Clever Trade Shield...
echo Your browser should open automatically.
echo Keep this window open while using the app.
echo.

call npm run dev:open
pause
