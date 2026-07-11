@echo off
cd /d "%~dp0"
set "REPO=%CD%"
set "KEY=%USERPROFILE%\.ssh\contabo_nikola"
set "HOST=niki@5.189.136.118"
set "REMOTE_DIR=/home/niki/book-easy"

:MENU
cls
echo.
echo ============================================
echo   book.easy.mk - Web Control Panel
echo ============================================
echo.
echo   [A] PREVIEW
echo   1. Start Dev Server (Docker DB + migrations + Next.js)
echo   2. Start Dev Server + Docker (auto-starts Docker Desktop if needed)
echo.
echo   [B] DEPLOY
echo   3. Deploy to book.easy.mk
echo.
echo   [C] VERSION CONTROL
echo   4. Save version to GitHub
echo   5. See all saved versions
echo   6. Save version + Deploy (full release)
echo.
echo   [0] Exit
echo ============================================
echo.
set /p CHOICE="Choose: "

if "%CHOICE%"=="1" goto PREVIEW
if "%CHOICE%"=="2" goto PREVIEW_AUTO_DOCKER
if "%CHOICE%"=="3" goto DEPLOY
if "%CHOICE%"=="4" goto SAVE
if "%CHOICE%"=="5" goto LIST_VERSIONS
if "%CHOICE%"=="6" goto RELEASE
if "%CHOICE%"=="0" exit /b 0
goto MENU


:PREVIEW
cls
echo.
echo ============================================
echo   Start Dev Server
echo ============================================
echo.
goto PREVIEW_BODY


:PREVIEW_AUTO_DOCKER
cls
echo.
echo ============================================
echo   Start Dev Server + Docker
echo ============================================
echo.
echo [0/4] Checking if Docker Desktop is running...
docker info >nul 2>&1
if not errorlevel 1 (
    echo   Docker is already running.
    goto PREVIEW_BODY
)

echo   Docker is not running - starting Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo   Waiting for Docker to become ready (this can take up to a few minutes)...
set DOCKER_TRIES=0
:WAIT_DOCKER
set /a DOCKER_TRIES+=1
timeout /t 10 /nobreak >nul
docker info >nul 2>&1
if not errorlevel 1 goto PREVIEW_BODY
if %DOCKER_TRIES% GEQ 18 (
    echo.
    echo   ERROR - Docker Desktop did not become ready in time. Try again once it's fully started.
    pause
    goto MENU
)
echo   Still waiting... (%DOCKER_TRIES%/18)
goto WAIT_DOCKER


:PREVIEW_BODY
echo [1/4] Starting Postgres (Docker)...
docker compose up -d
if errorlevel 1 (
    echo.
    echo   ERROR - Docker failed to start the database. Is Docker Desktop running?
    pause
    goto MENU
)

echo.
echo [2/4] Waiting for Postgres to accept connections...
timeout /t 5 /nobreak >nul

echo.
echo [3/4] Applying database schema...
call npm run db:generate
call npm run db:push
if errorlevel 1 (
    echo.
    echo   ERROR - Prisma db push failed. Check your .env DATABASE_URL.
    pause
    goto MENU
)

echo.
echo [4/4] Starting the web app...
echo   Opening http://localhost:3000
echo   Press Ctrl+C in this window to stop.
echo   (Postgres keeps running in Docker until you run "docker compose down" separately)
echo.
start /b cmd /c "timeout /t 3 /nobreak >nul && start "" http://localhost:3000"
call npm run dev
pause
goto MENU


:DEPLOY
cls
echo.
echo ============================================
echo   Deploy to book.easy.mk
echo ============================================
echo.
goto DEPLOY_BODY


:DEPLOY_BODY
echo [1/2] Checking remote repo (first-time clone if missing)...
ssh -i "%KEY%" %HOST% "test -d %REMOTE_DIR%/.git || git clone https://github.com/nikdimo/book.easy.git %REMOTE_DIR%"
if errorlevel 1 (
    echo   ERROR - Could not reach VPS or clone failed. Check SSH connection.
    pause
    goto MENU
)

echo.
echo [2/2] Pulling latest code, building, and restarting the service...
ssh -i "%KEY%" %HOST% "bash %REMOTE_DIR%/scripts/deploy-remote.sh"
if errorlevel 1 (
    echo   ERROR - Deploy script failed on VPS. See output above.
    pause
    goto MENU
)

echo.
echo ============================================
echo   SUCCESS - Live at https://book.easy.mk
echo ============================================
echo.
pause
goto MENU


:SAVE
cls
echo.
echo ============================================
echo   Save Version to GitHub
echo ============================================
echo.
call :SAVE_BODY
echo.
pause
goto MENU


:SAVE_BODY
set /p MSG="Describe this version: "
if "%MSG%"=="" (
    echo   ERROR: Description cannot be empty.
    exit /b 1
)
echo.
powershell -NoProfile -Command "$cred = cmdkey /list | Select-String -Context 0,2 'git:https://github.com'; if ($cred -and (($cred | Out-String) -match 'octabimdev')) { cmdkey /delete:LegacyGeneric:target=git:https://github.com | Out-Null; Write-Host '  Cleared a stale GitHub login (was cached as the wrong account) - you may be prompted to sign in again.' }"
echo.
powershell -Command "& { $all = git log --oneline | Measure-Object -Line | Select-Object -ExpandProperty Lines; $nextV = $all + 1; $tag = 'V' + $nextV; git add .; git commit -m ('feat: V' + $nextV + ' - %MSG%'); git tag $tag; git push; git push origin $tag; if ($LASTEXITCODE -eq 0) { Write-Host (''); Write-Host ('  SUCCESS - V' + $nextV + ' saved to GitHub.'); exit 0 } else { Write-Host ('  ERROR - Push failed. Check output above.'); exit 1 } }"
exit /b %ERRORLEVEL%


:RELEASE
cls
echo.
echo ============================================
echo   Save Version + Deploy (full release)
echo ============================================
echo.
call :SAVE_BODY
if errorlevel 1 (
    echo.
    echo   Aborting - fix the issue above before deploying.
    pause
    goto MENU
)
echo.
echo ============================================
echo   Deploy to book.easy.mk
echo ============================================
echo.
goto DEPLOY_BODY


:LIST_VERSIONS
cls
echo.
echo ============================================
echo   Saved Versions
echo ============================================
echo.
powershell -Command "& { $commits = git log --pretty=format:'%%h|%%ad|%%s' --date=format:'%%Y-%%m-%%d %%H:%%M'; $i = 1; foreach ($c in $commits) { $parts = $c -split '\|'; Write-Host ('  ' + $i + '. [' + $parts[1] + ']  ' + $parts[2]); $i++ } }"
echo.
pause
goto MENU
