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
echo   Linger Homes - Web Control Panel
echo ============================================
echo.
echo   [A] PREVIEW
echo   1. Start Dev Server (migrations + Next.js)
echo   M. Start Mobile App Preview (web + React Native)
echo   K. Build Android Debug APK
echo   I. Start iPhone Expo Go Preview
echo.
echo   [B] DEPLOY
echo   2. Deploy to lingerhomes.com
echo.
echo   [C] VERSION CONTROL
echo   3. Save version to GitHub
echo   4. See all saved versions
echo   5. Save version + Deploy (full release)
echo.
echo   [0] Exit
echo ============================================
echo.
set /p CHOICE="Choose: "

if "%CHOICE%"=="1" goto PREVIEW
if /I "%CHOICE%"=="M" goto MOBILE_PREVIEW
if /I "%CHOICE%"=="K" goto MOBILE_ANDROID
if /I "%CHOICE%"=="I" goto MOBILE_IPHONE
if "%CHOICE%"=="2" goto DEPLOY
if "%CHOICE%"=="3" goto SAVE
if "%CHOICE%"=="4" goto LIST_VERSIONS
if "%CHOICE%"=="5" goto RELEASE
if "%CHOICE%"=="0" exit /b 0
goto MENU


:MOBILE_IPHONE
cls
echo.
echo ============================================
echo   Start iPhone Expo Go Preview
echo ============================================
echo.
echo   The iPhone and this computer must be on the same Wi-Fi network.
echo   Install Expo Go on the iPhone, then scan the QR code in the Expo window.
echo   This preview uses the local API on this computer, not the VPS.
echo.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
    echo   ERROR - Port 8081 is already in use.
    echo   Close the web mobile preview window started by option M, then try I again.
    pause
    goto MENU
)
for /f "delims=" %%I in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } ^| Select-Object -First 1 -ExpandProperty IPAddress)"') do set "LAN_IP=%%I"
if not defined LAN_IP (
    echo   ERROR - Could not determine this computer's LAN IP address.
    pause
    goto MENU
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [1/2] Starting the local web API...
    if exist ".next\dev" rmdir /s /q ".next\dev"
    start "BookEasy Web" cmd /k "cd /d ""%REPO%"" && npm run dev -- --webpack"
    timeout /t 3 /nobreak >nul
) else (
    echo [1/2] Local web API is already running at http://localhost:3000
)

echo [2/2] Starting Expo for iPhone...
echo   API address: http://%LAN_IP%:3000
start "Linger Homes iPhone Expo" cmd /k "cd /d ""%REPO%\mobile"" && set EXPO_PUBLIC_API_URL=http://%LAN_IP%:3000 && npx expo start --lan"
echo.
echo   On the iPhone:
echo   1. Install Expo Go from the App Store.
echo   2. Keep the iPhone and PC on the same Wi-Fi.
echo   3. Scan the QR code shown in the Expo window.
echo   4. If Expo Go reports an SDK mismatch, use an iOS development build.
echo.
pause
goto MENU


:MOBILE_ANDROID
cls
echo.
echo ============================================
echo   Build Android Debug APK
echo ============================================
echo.
echo   This creates a local test APK. The Android folder is generated and ignored by Git.
echo   The APK will connect to the production API at https://lingerhomes.com.
echo.
echo   The build script will remove and regenerate the complete Android folder.
echo   If the first build fails, it will perform one full clean retry automatically.
set "NODE_ENV=development"
set "EXPO_PUBLIC_API_URL=https://lingerhomes.com"
call npm run mobile:android:debug
if errorlevel 1 (
    echo.
    echo   ERROR - Android debug build failed.
    pause
    goto MENU
)
echo.
echo   APK created at:
echo   %REPO%\mobile\android\app\build\outputs\apk\debug\app-debug.apk
start "" explorer.exe "%REPO%\mobile\android\app\build\outputs\apk\debug"
pause
goto MENU


:MOBILE_PREVIEW
cls
echo.
echo ============================================
echo   Start Mobile App Preview
echo ============================================
echo.

rem Reuse an existing backend. Starting two Next.js processes against the same
rem .next directory can corrupt the development cache on Windows.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 goto MOBILE_WEB_READY

echo [1/3] Preparing the database...
call npm run db:generate
call npm run db:push
if errorlevel 1 (
    echo.
    echo   ERROR - Database preparation failed. Check DATABASE_URL and PostgreSQL.
    pause
    goto MENU
)

echo.
echo [2/3] Starting the web API and control panel...
if exist ".next\dev" rmdir /s /q ".next\dev"
if exist ".next\dev" (
    echo.
    echo   ERROR - Could not clear .next\dev.
    echo   Close any other Linger Homes server windows and try again.
    pause
    goto MENU
)
start "BookEasy Web" cmd /k "cd /d ""%REPO%"" && npm run dev -- --webpack"
goto MOBILE_WEB_STARTED

:MOBILE_WEB_READY
echo [1/3] Web API already running at http://localhost:3000

:MOBILE_WEB_STARTED
echo.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 goto MOBILE_APP_READY

echo [3/3] Building and starting the React Native web preview...
start "Property Host Mobile" cmd /k "cd /d ""%REPO%"" && npm run mobile:preview"
goto MOBILE_OPEN

:MOBILE_APP_READY
echo [3/3] Mobile app already running at http://localhost:8081

:MOBILE_OPEN
echo.
echo   Waiting for both applications, then opening:
echo   http://localhost:8081/dashboard
echo.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$mobile='http://localhost:8081/dashboard'; for ($i=0; $i -lt 120; $i++) { if (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) { Start-Process $mobile; exit 0 }; Start-Sleep -Seconds 1 }; Start-Process $mobile"
echo   The mobile preview opens automatically when it is ready.
echo   Use the same Google or email-link login as the web control panel.
echo.
pause
goto MENU


:PREVIEW
cls
echo.
echo ============================================
echo   Start Dev Server
echo ============================================
echo.
goto PREVIEW_BODY


:PREVIEW_BODY
rem Never start a second Next.js process against the same .next cache. Concurrent
rem dev processes can corrupt Turbopack's persistent task state on Windows.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
    echo   The web app is already running at http://localhost:3000
    start "" http://localhost:3000
    echo   Stop the existing server before starting a fresh preview.
    pause
    goto MENU
)

echo [1/2] Applying database schema...
call npm run db:generate
call npm run db:push
if errorlevel 1 (
    echo.
    echo   ERROR - Prisma db push failed. Check your .env DATABASE_URL and that PostgreSQL is running.
    pause
    goto MENU
)

echo.
echo [2/2] Starting the web app...
echo   Clearing generated development cache...
if exist ".next\dev" rmdir /s /q ".next\dev"
if exist ".next\dev" (
    echo.
    echo   ERROR - Could not clear .next\dev. Another Next.js process may still be running.
    echo   Close any other Linger Homes server windows and try again.
    pause
    goto MENU
)
echo   Opening http://localhost:3000
echo   Press Ctrl+C in this window to stop.
echo.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "$url='http://localhost:3000'; for ($i=0; $i -lt 90; $i++) { if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { Start-Process $url; exit 0 }; Start-Sleep -Seconds 1 }; Start-Process $url"
rem Webpack is used for control-panel previews because Next 16.2.2 Turbopack can
rem panic while restoring its Windows persistent cache. Production builds still use
rem the default Turbopack build path.
call npm run dev -- --webpack
pause
goto MENU


:DEPLOY
cls
echo.
echo ============================================
echo   Deploy to lingerhomes.com
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
rem Refresh before launching the script so a release that changes the deployment
rem procedure runs the new procedure immediately, not the previous VPS copy.
ssh -i "%KEY%" %HOST% "git -C %REMOTE_DIR% fetch origin && git -C %REMOTE_DIR% reset --hard origin/main && bash %REMOTE_DIR%/scripts/deploy-remote.sh"
if errorlevel 1 (
    echo   ERROR - Deploy script failed on VPS. See output above.
    pause
    goto MENU
)

echo.
echo ============================================
echo   SUCCESS - Live at https://lingerhomes.com
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
powershell -NoProfile -Command "$cred = cmdkey /list | Select-String -Context 0,2 'git:https://github.com'; if ($cred -and (($cred | Out-String) -match 'octabimdev')) { cmdkey /delete:LegacyGeneric:target=git:https://github.com | Out-Null; Write-Host '  Cleared a stale GitHub login (was cached as the wrong account) - you may be prompted to sign in again.' }"
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\save-version.ps1"
exit /b %ERRORLEVEL%


:RELEASE
cls
echo.
echo ============================================
echo   Save Version + Deploy (full release)
echo ============================================
echo.
echo [preflight] Refreshing the UI catalog...
call npm run i18n:extract
if errorlevel 1 (
    echo.
    echo   ERROR - Translation catalog extraction failed. Nothing was saved or deployed.
    pause
    goto MENU
)

echo.
echo [preflight] Translating new or changed UI copy...
call npm run i18n:sync
if errorlevel 1 (
    echo.
    echo   The local translation database is incomplete or stale.
    echo   Automatic translation did not finish. Check the provider message above.
    echo   Configure ANTHROPIC_API_KEY or GOOGLE_API_KEY, then run option 5 again.
    echo   Nothing was saved or deployed.
    pause
    goto MENU
)

echo.
echo [preflight] Exporting the complete reviewed AI translation snapshot...
call npm run i18n:export-reviewed
if errorlevel 1 (
    echo.
    echo   ERROR - Translations are still incomplete or stale after the API sync.
    echo   Nothing was saved or deployed. Review the errors above.
    pause
    goto MENU
)
echo.
echo [preflight] Auditing reviewed translations...
call npm run i18n:audit
if errorlevel 1 (
    echo.
    echo   ERROR - Translation quality audit failed.
    echo   Nothing was saved or deployed. Review the issues above.
    pause
    goto MENU
)
echo   Reviewed translation snapshot is complete.
echo.
echo [preflight] Exporting the local amenity catalog...
call npm run amenities:export
if errorlevel 1 (
    echo.
    echo   ERROR - Local amenities could not be exported.
    echo   Make sure the local database is running, then run option 5 again.
    echo   Nothing was saved or deployed.
    pause
    goto MENU
)
echo   Local amenity catalog is ready for production sync.
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
echo   Deploy to lingerhomes.com
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
