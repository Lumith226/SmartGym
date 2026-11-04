@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo WEB - Open http://localhost:8080 in Chrome or Edge.
echo Start run_server.bat in a separate window for AI.
python web\serve.py --port 8080
if errorlevel 1 pause
