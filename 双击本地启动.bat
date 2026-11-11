@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo 🚀 启动 MOSS-5B Krea Studio (独立项目 · 端口 3091)
echo ========================================================
start "" "http://127.0.0.1:3091/generate.html"
python server.py
pause
