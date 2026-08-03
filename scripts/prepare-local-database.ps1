param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = "Stop"
$repoPath = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd("\")
$prismaClientDir = Join-Path $repoPath "node_modules\.prisma\client"

# How long to wait for a script that is already running to finish with the query engine.
# `i18n:sync` is the usual one and it spends its time in external API calls, so it can
# legitimately hold the DLL for a while.
$engineWaitSeconds = 45

<#
    Prisma regenerates by writing a new query engine to a .tmp file and renaming it over
    the old one. Windows refuses that rename while the DLL is mapped into a live process,
    which surfaces as `EPERM: operation not permitted, rename ...`.

    This used to look only for Next.js processes, which missed every other Prisma consumer
    in the repo — `npm run i18n:sync` in particular loads Prisma Client to write
    translations, and running the control panel's "Start Dev Server" while a sync was in
    flight failed with nothing more useful than "a local process may still hold the DLL".
#>

# Never treat this script's own process tree as a blocker. The control panel reaches here
# through node and npm, whose command lines contain the repo path, so a plain "any node
# process under this repo" sweep would kill its own parent.
function Get-SelfProcessIds {
    $ids = New-Object 'System.Collections.Generic.HashSet[int]'
    $current = $PID
    for ($depth = 0; $depth -lt 16; $depth++) {
        if (-not $current -or $current -le 0) { break }
        if (-not $ids.Add($current)) { break }
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
        if (-not $proc) { break }
        $current = [int]$proc.ParentProcessId
    }
    return $ids
}

function Get-RepoNodeProcesses {
    param([System.Collections.Generic.HashSet[int]]$ExcludeIds)

    return @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object {
        $commandLine = if ($_.CommandLine) { $_.CommandLine } else { "" }
        $commandLine.IndexOf($repoPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
            -not $ExcludeIds.Contains([int]$_.ProcessId)
    })
}

function Test-IsNextServer {
    param($Process)

    $commandLine = if ($Process.CommandLine) { $Process.CommandLine } else { "" }
    return $commandLine -match "next[\\/]dist[\\/](bin[\\/]next|server[\\/]lib[\\/]start-server\.js)"
}

# Ask the filesystem instead of guessing from process names: open every engine binary for
# exclusive write and see whether Windows allows it. This catches any holder, including
# ones started outside this repo's scripts.
function Test-EngineLocked {
    $engines = @(Get-ChildItem -Path $prismaClientDir -Filter "query_engine-*.node" -File -ErrorAction SilentlyContinue)
    foreach ($engine in $engines) {
        try {
            $stream = [System.IO.File]::Open($engine.FullName, 'Open', 'ReadWrite', 'None')
            $stream.Close()
            $stream.Dispose()
        } catch {
            return $true
        }
    }
    return $false
}

function Format-ProcessLine {
    param($Process)

    $commandLine = if ($Process.CommandLine) { $Process.CommandLine } else { "(command line unavailable)" }
    if ($commandLine.Length -gt 120) { $commandLine = $commandLine.Substring(0, 120) + "..." }
    return "    PID $($Process.ProcessId): $commandLine"
}

$selfIds = Get-SelfProcessIds

Write-Host "  Checking for local processes that can lock Prisma..."

# Dev servers are killed rather than waited on: they are long-running by design and the
# control panel is about to start a fresh one anyway.
$nextProcesses = @(Get-RepoNodeProcesses -ExcludeIds $selfIds | Where-Object { Test-IsNextServer $_ })
foreach ($nextProcess in $nextProcesses) {
    Write-Host "  Stopping local Next.js process $($nextProcess.ProcessId) before Prisma regeneration..."
    Stop-Process -Id $nextProcess.ProcessId -Force -ErrorAction SilentlyContinue
}
foreach ($nextProcess in $nextProcesses) {
    try {
        Wait-Process -Id $nextProcess.ProcessId -Timeout 10 -ErrorAction Stop
    } catch {
        # Wait-Process throws once the process has exited, which is the desired state.
    }
}

# Anything else is waited out, not killed. A sync writes to the database in batches, and
# terminating one mid-batch to save a few seconds is a bad trade.
if (Test-EngineLocked) {
    $deadline = (Get-Date).AddSeconds($engineWaitSeconds)
    $announced = $false
    while ((Test-EngineLocked) -and (Get-Date) -lt $deadline) {
        if (-not $announced) {
            $announced = $true
            Write-Host "  The Prisma query engine is in use. Waiting up to $engineWaitSeconds seconds for it to be released..."
            foreach ($blocker in Get-RepoNodeProcesses -ExcludeIds $selfIds) {
                Write-Host (Format-ProcessLine $blocker)
            }
        }
        Start-Sleep -Seconds 2
    }

    if (Test-EngineLocked) {
        Write-Host "  ERROR - The Prisma query engine is still locked, so regeneration would fail with EPERM."
        Write-Host "  Still running:"
        $blockers = @(Get-RepoNodeProcesses -ExcludeIds $selfIds)
        if ($blockers.Count -gt 0) {
            foreach ($blocker in $blockers) { Write-Host (Format-ProcessLine $blocker) }
        } else {
            Write-Host "    (no node process from this repo - check for another editor, terminal, or antivirus scan holding the file)"
        }
        Write-Host "  Let it finish, or stop it, then run this again."
        exit 1
    }

    Write-Host "  Query engine released."
}

# Every failed rename leaves a ~21 MB .tmp behind and Prisma never collects them, so they
# accumulate silently across failures.
$staleTemps = @(Get-ChildItem -Path $prismaClientDir -Filter "query_engine-*.node.tmp*" -File -ErrorAction SilentlyContinue)
if ($staleTemps.Count -gt 0) {
    $freedMb = [Math]::Round((($staleTemps | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
    Write-Host "  Removing $($staleTemps.Count) leftover query-engine temp file(s) ($freedMb MB)..."
    foreach ($staleTemp in $staleTemps) {
        Remove-Item -LiteralPath $staleTemp.FullName -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "  Generating Prisma client..."
& npm.cmd run db:generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR - Prisma client generation failed. A local process may still hold the query-engine DLL."
    exit $LASTEXITCODE
}

Write-Host "  Applying local database schema..."
& npm.cmd run db:push
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR - Prisma database push failed. Check PostgreSQL and DATABASE_URL."
    exit $LASTEXITCODE
}

Write-Host "  Local database is ready."
exit 0
