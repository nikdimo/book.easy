param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = "Stop"
$repoPath = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd("\")

Write-Host "  Checking for local Next.js processes that can lock Prisma..."
$nextProcesses = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $commandLine = if ($_.CommandLine) { $_.CommandLine } else { "" }
    $commandLine.IndexOf($repoPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $commandLine -match "next[\\/]dist[\\/](bin[\\/]next|server[\\/]lib[\\/]start-server\.js)"
})

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
