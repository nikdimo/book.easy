param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath
)

$ErrorActionPreference = "Stop"

$deletedFiles = @(
    git diff --name-only --diff-filter=D --
    git diff --cached --name-only --diff-filter=D --
) | Where-Object { $_ }

if ($deletedFiles.Count -gt 0) {
    throw "Quick deploy cannot safely deploy deleted files. Use option 5."
}

$trackedFiles = @(git ls-files)
if ($LASTEXITCODE -ne 0 -or $trackedFiles.Count -eq 0) {
    throw "Could not read the Git-tracked file list."
}

$secretLikeFiles = $trackedFiles | Where-Object {
    (($_ -match '(^|/)\.env($|\.)') -and ($_ -notmatch '(^|/)\.env\.example$')) -or
    ($_ -match '(^|/)\.secrets?(/|$)') -or
    ($_ -match '\.(pem|key|p12|pfx)$') -or
    ($_ -match '(^|/)(id_rsa|id_ed25519)(\.pub)?$')
}

if ($secretLikeFiles.Count -gt 0) {
    $display = $secretLikeFiles -join [Environment]::NewLine
    throw "Refusing to deploy tracked secret-like files:$([Environment]::NewLine)$display"
}

$missingFiles = $trackedFiles | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }
if ($missingFiles.Count -gt 0) {
    throw "A tracked file is missing locally. Use option 5 so Git can mirror the deletion."
}

if (Test-Path -LiteralPath $ArchivePath) {
    Remove-Item -LiteralPath $ArchivePath -Force
}

try {
    # Passing an explicit file list means untracked and ignored files can never enter
    # the archive, regardless of their names or where they sit in the workspace.
    $trackedFiles | tar -czf $ArchivePath -T -
    if ($LASTEXITCODE -ne 0) {
        throw "tar failed with exit code $LASTEXITCODE."
    }

    tar -tzf $ArchivePath *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "The generated archive failed validation."
    }
} catch {
    if (Test-Path -LiteralPath $ArchivePath) {
        Remove-Item -LiteralPath $ArchivePath -Force
    }
    throw
}

Write-Host "  Packaged $($trackedFiles.Count) Git-tracked files."
