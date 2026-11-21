@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 18 or newer from https://nodejs.org/
  pause
  exit /b 1
)

node -e "if (Number(process.versions.node.split('.')[0]) < 18) process.exit(1)"
if errorlevel 1 (
  echo Node.js 18 or newer is required. Current version:
  node --version
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Installing server dependencies...
  call npm install
  if errorlevel 1 goto failed
)

if not exist "data\finance-data.xlsx" (
  echo Creating the Excel workbook and initial sheets...
  call npm run init-data
  if errorlevel 1 goto failed
)

echo Starting Finova. Your browser will open automatically.
start "Finova dashboard" /B powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:4173'"
call npm start
if errorlevel 1 goto failed
endlocal
exit /b 0

:failed
echo.
echo Setup or server startup failed. Read the error above, then try again.
pause
endlocal
exit /b 1
