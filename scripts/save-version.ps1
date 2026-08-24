[CmdletBinding()]
param(
    [ValidateRange(1, 10)]
    [int]$MaxPushAttempts = 5,

    [string]$Description = $env:BOOKEASY_RELEASE_DESCRIPTION
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [Parameter(Mandatory)]
        [string]$FailureMessage
    )

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

try {
    $message = $Description
    if ([string]::IsNullOrWhiteSpace($message)) {
        $message = Read-Host "Describe this version"
    }
    if ([string]::IsNullOrWhiteSpace($message)) {
        throw "Description cannot be empty."
    }
    $message = $message.Trim()

    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
        throw "Could not determine the current Git branch."
    }

    # The repository intentionally uses Git's configured Windows line-ending
    # conversion. Suppress its per-file LF/CRLF notices for this one staging command;
    # this changes neither file contents nor local/global Git configuration.
    Invoke-Git `
        -Arguments @("-c", "core.safecrlf=false", "add", "--all") `
        -FailureMessage "Could not stage the working tree."

    & git diff --cached --quiet
    $diffExitCode = $LASTEXITCODE
    $tag = $null

    if ($diffExitCode -eq 0) {
        $aheadText = (& git rev-list --count "origin/$branch..HEAD").Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "No changes were staged, and the unpublished release state could not be checked."
        }

        $releaseTags = @(
            & git tag --points-at HEAD |
                Where-Object { $_ -match "^V[0-9]+$" }
        )
        if ([int]$aheadText -eq 1 -and $releaseTags.Count -eq 1) {
            $tag = $releaseTags[0]
            Write-Host ""
            Write-Host "  Resuming unpublished release $tag from the current commit."
        } else {
            throw "There are no new changes to save and no single unpublished release to resume."
        }
    } elseif ($diffExitCode -eq 1) {
        $commitCountText = (& git rev-list --count HEAD).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Could not calculate the next version number."
        }

        $nextVersion = [int]$commitCountText + 1
        $tag = "V$nextVersion"
        & git rev-parse --verify --quiet "refs/tags/$tag" *> $null
        if ($LASTEXITCODE -eq 0) {
            throw "Tag $tag already exists. Resolve the version history before trying again."
        }

        Invoke-Git `
            -Arguments @("commit", "-m", "feat: $tag - $message") `
            -FailureMessage "Could not create the release commit."
        Invoke-Git `
            -Arguments @("tag", $tag) `
            -FailureMessage "The commit was created, but tag $tag could not be created."
    } else {
        throw "Git could not inspect the staged changes."
    }

    for ($attempt = 1; $attempt -le $MaxPushAttempts; $attempt += 1) {
        Write-Host ""
        Write-Host "  Publishing $tag to GitHub (attempt $attempt of $MaxPushAttempts)..."
        & git push --atomic origin "HEAD:refs/heads/$branch" "refs/tags/$tag"
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "  SUCCESS - $tag saved to GitHub."
            exit 0
        }

        if ($attempt -lt $MaxPushAttempts) {
            $delaySeconds = [Math]::Min(30, 5 * [Math]::Pow(2, $attempt - 1))
            Write-Host "  Push failed. Retrying in $([int]$delaySeconds) seconds..."
            Start-Sleep -Seconds $delaySeconds
        }
    }

    throw "Push failed after $MaxPushAttempts attempts. The local release is preserved and can be resumed by running the same option again."
} catch {
    Write-Host ""
    Write-Host "  ERROR - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
