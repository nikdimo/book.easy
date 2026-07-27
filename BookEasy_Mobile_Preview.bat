@echo off
setlocal
cd /d "%~dp0"

start "BookEasy Web" cmd /k "npm run dev"
start "Property Host Mobile" cmd /k "npm run mobile:preview"

echo Starting the web control panel and React Native mobile preview...
echo Open http://localhost:3000/host/mobile after both terminals are ready.
timeout /t 6 /nobreak >nul
start "" "http://localhost:3000/host/mobile"
