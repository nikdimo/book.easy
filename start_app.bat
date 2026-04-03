@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo.
  echo [!] No .env file found.
  echo     Copy .env.example to .env and set DATABASE_URL and AUTH_SECRET first.
  echo     See README.md for details.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Postgres in Docker if available ^(ignore errors if you use local Postgres^)...
docker compose up -d 2>nul
timeout /t 2 /nobreak >nul

echo Starting book.easy.mk dev server...
start "book.easy.mk dev" /D "%~dp0" cmd /k npm run dev

echo Waiting for the server to start...
timeout /t 6 /nobreak >nul

start "" "http://localhost:3000"
echo.
echo Browser should open at http://localhost:3000
echo Close the other window titled "book.easy.mk dev" to stop the server.
echo.
pause
