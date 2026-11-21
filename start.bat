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
  echo Dependencies are missing. Installing them now...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting Finova at http://localhost:4173
call npm start
if errorlevel 1 (
  echo The server stopped with an error. Check the output above.
  pause
)
endlocal
