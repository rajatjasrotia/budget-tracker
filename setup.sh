#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 18 or newer, then run this script again." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 18 )); then
  echo "Node.js 18 or newer is required (found $(node --version))." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Reinstall Node.js with npm included." >&2
  exit 1
fi

echo "Installing finance dashboard dependencies..."
npm install

echo "Creating the Excel workbook and initial sheets..."
npm run init-data

echo
echo "Setup complete. On Windows, double-click start.bat to start the server and open the dashboard."
echo "On macOS/Linux, run: npm start"
