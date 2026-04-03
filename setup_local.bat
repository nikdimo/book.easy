@echo off
setlocal
cd /d "%~dp0"

echo === book.easy.mk local setup ===
echo.

echo [1/4] Starting Postgres in Docker ^(skip if Docker is off; use your own Postgres on 5432^)...
docker compose up -d 2>nul
if errorlevel 1 (
  echo Docker not running or compose failed — if port 5432 is already Postgres, continuing.
) else (
  echo Waiting for Postgres...
  timeout /t 5 /nobreak >nul
)

echo [2/4] npm install...
call npm install
if errorlevel 1 exit /b 1

echo [3/4] Prisma generate + db push...
call npx prisma generate
call npx prisma db push
if errorlevel 1 (
  echo Check DATABASE_URL in .env ^(postgresql://postgres:postgres@localhost:5432/bookeasy^)
  pause
  exit /b 1
)

echo [4/4] Seed demo data...
call npx prisma db seed
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Done. Test logins: README.md ^(password password123^)
echo Run start_app.bat to open the app.
echo.
pause
