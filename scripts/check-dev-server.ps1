param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$repoPath = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd("\")
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (-not $listener) {
    exit 1
}

$owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
$commandLine = if ($owner.CommandLine) { $owner.CommandLine } else { "" }
$isThisProject =
    $commandLine.IndexOf($repoPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $commandLine -match "node_modules[\\/]next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js"

if (-not $isThisProject) {
    Write-Host "  ERROR - Port $Port belongs to another program (PID $($listener.OwningProcess))."
    Write-Host "  It was left untouched. Close that program or change its port, then try again."
    exit 2
}

$healthUrl = "http://localhost:$Port/api/mobile/v1/languages?locale=en"
try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 10
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        Write-Host "  The existing Linger Homes web server is healthy."
        exit 0
    }
} catch {
    # A listener can survive after its generated Next.js files become invalid.
}

$process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
if ($process -and ((Get-Date) - $process.StartTime).TotalSeconds -lt 180) {
    Write-Host "  The existing Linger Homes web server is still starting."
    exit 0
}

Write-Host "  Found an unhealthy Linger Homes server. Stopping it before a clean restart..."
Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue

for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
        exit 1
    }
}

Write-Host "  ERROR - The stale server did not release port $Port."
exit 3
