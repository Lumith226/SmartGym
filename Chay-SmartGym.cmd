@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
    echo Missing .env. See docs\guides\GETTING_STARTED.md for first-time setup.
    pause
    exit /b 1
)
node --env-file=.env scripts\start-compose-local.mjs %*
if errorlevel 1 (
    echo SmartGym could not start. See the error above.
    pause
    exit /b 1
)
start "" "https://127.0.0.1:3100/"
