@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo SERVER AI - http://127.0.0.1:8001
echo Keep this window open. Press Ctrl+C to stop.
python -m server.app --device auto --port 8001
if errorlevel 1 pause
