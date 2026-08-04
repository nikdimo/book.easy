[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [ValidateRange(1, 30)]
    [int]$TimeoutSeconds = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
    $repoPath = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd("\")
    $allProcesses = @(Get-CimInstance Win32_Process)

    # Match only Next.js development processes whose command line contains this exact
    # repository path. Other Node applications (Adobe, Codex, another repository, and
    # production-like builds) are deliberately outside the target set.
    $devProcesses = @(
        $allProcesses | Where-Object {
            if ($_.Name -ne "node.exe" -or -not $_.CommandLine) { return $false }
            $belongsToRepo =
                $_.CommandLine.IndexOf(
                    $repoPath,
                    [System.StringComparison]::OrdinalIgnoreCase
                ) -ge 0
            if (-not $belongsToRepo) { return $false }

            $_.CommandLine -match 'next[\\/]dist[\\/]bin[\\/]next"?\s+dev(?:\s|$)' -or
                $_.CommandLine -match "node_modules[\\/]next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js" -or
                $_.CommandLine -match "[\\/]\.next[\\/]dev[\\/]"
        }
    )

    if ($devProcesses.Count -gt 0) {
        $devIds = @($devProcesses | ForEach-Object { [int]$_.ProcessId })
        # Kill only roots within the matched dev-process tree. taskkill /T then handles
        # their matched descendants, avoiding repeated kills and allowing npm to exit
        # normally when its Next.js child disappears.
        $roots = @(
            $devProcesses | Where-Object {
                $devIds -notcontains [int]$_.ParentProcessId
            }
        )

        foreach ($process in $roots) {
            Write-Host "  Stopping Linger Homes dev server process tree (PID $($process.ProcessId))..."
            & taskkill.exe /PID $process.ProcessId /T /F *> $null
            if ($LASTEXITCODE -ne 0) {
                throw "Windows could not stop dev-server process $($process.ProcessId)."
            }
        }
    } else {
        Write-Host "  No Linger Homes dev server is running."
    }

    $queryEngine = Join-Path $repoPath "node_modules\.prisma\client\query_engine-windows.dll.node"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $remainingDevProcess = Get-CimInstance Win32_Process | Where-Object {
            $_.Name -eq "node.exe" -and
                $_.CommandLine -and
                $_.CommandLine.IndexOf(
                    $repoPath,
                    [System.StringComparison]::OrdinalIgnoreCase
                ) -ge 0 -and
                (
                    $_.CommandLine -match 'next[\\/]dist[\\/]bin[\\/]next"?\s+dev(?:\s|$)' -or
                    $_.CommandLine -match "node_modules[\\/]next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js" -or
                    $_.CommandLine -match "[\\/]\.next[\\/]dev[\\/]"
                )
        } | Select-Object -First 1

        $queryEngineUnlocked = $true
        if (Test-Path -LiteralPath $queryEngine) {
            try {
                $stream = [System.IO.File]::Open(
                    $queryEngine,
                    [System.IO.FileMode]::Open,
                    [System.IO.FileAccess]::ReadWrite,
                    [System.IO.FileShare]::None
                )
                $stream.Dispose()
            } catch [System.IO.IOException] {
                $queryEngineUnlocked = $false
            } catch [System.UnauthorizedAccessException] {
                $queryEngineUnlocked = $false
            }
        }

        if (-not $remainingDevProcess -and $queryEngineUnlocked) {
            Write-Host "  Local dev server is stopped and Prisma's query engine is unlocked."
            exit 0
        }

        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    throw "The repository's dev server or Prisma query-engine lock remained active for more than $TimeoutSeconds seconds."
} catch {
    Write-Host "  ERROR - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
