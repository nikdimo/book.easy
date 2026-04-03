@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

REM Long "git diff" output opens less and waits for "q" — disable pager for this script.
set "GIT_PAGER="
set "PAGER="

set "REPO_URL=https://github.com/nikdimo/book.easy.git"
set "EXITCODE=0"

where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not on PATH. Install Git for Windows: https://git-scm.com/download/win
    set "EXITCODE=1"
    goto :end
)

if not exist ".git\" (
    echo [INFO] No .git folder — initializing repository.
    git init
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [INFO] Adding remote "origin" — %REPO_URL%
    git remote add origin "%REPO_URL%"
) else (
    echo [OK] Remote "origin" is already configured.
)

echo.
echo [INFO] Staging changes. Only files NOT listed in .gitignore are included
echo        (e.g. node_modules, .next, .env, /public/uploads are excluded).
echo.

git add -A

git --no-pager diff --cached --quiet
if errorlevel 1 (
    echo Files staged for commit:
    git --no-pager diff --cached --name-only
    echo.
    set /p COMMIT_MSG=Commit message ^(Enter for "Update"^): 
    REM Inside parentheses, percent-vars expand when the block is parsed; use exclamation form.
    if "!COMMIT_MSG!"=="" set "COMMIT_MSG=Update"
    git commit -m "!COMMIT_MSG!"
    if errorlevel 1 (
        echo [ERROR] Commit failed.
        set "EXITCODE=1"
        goto :end
    )
) else (
    echo [INFO] Nothing new to stage/commit — working tree matches last commit.
)

git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No commits yet. Add project files or relax .gitignore if the repo should not be empty.
    set "EXITCODE=1"
    goto :end
)

REM Use "main" to match GitHub default (renames master -> main if needed).
git branch -M main

echo.
echo [INFO] Pushing to origin main ...
git push -u origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Sign in to GitHub: use HTTPS with a Personal Access Token,
    echo        or run: git config credential.helper manager
    echo        Repo: https://github.com/nikdimo/book.easy
    set "EXITCODE=1"
    goto :end
)

echo.
echo [OK] Done. Remote: %REPO_URL%

:end
echo.
pause
exit /b !EXITCODE!
