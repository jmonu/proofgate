@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer, then reopen this terminal.
  exit /b 1
)
if not exist node_modules (
  echo Dependencies missing. Run npm install first.
  exit /b 1
)
if not exist .env (
  echo Configuration missing. Run npm run configure and edit .env.
  exit /b 1
)
call npm run dev
exit /b %errorlevel%
