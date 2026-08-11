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

# The archive is exactly the Git-tracked file set, so a brand-new file that has not been
# `git add`ed yet is silently left out while the tracked files importing it are shipped.
# That builds fine locally (the file is on disk) and then fails the VPS build with
# "Module not found" after a full upload. Catch it here instead: every local import in
# the tracked sources must resolve to another tracked file.
function Resolve-ImportTarget {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$BaseDir,
        [Parameter(Mandatory = $true)][string]$Specifier
    )

    if ($Specifier.StartsWith("@/")) {
        $raw = "src/" + $Specifier.Substring(2)
    } else {
        $raw = "$BaseDir/$Specifier"
    }

    $segments = New-Object System.Collections.Generic.List[string]
    foreach ($segment in ($raw -split "/")) {
        if ($segment -eq "" -or $segment -eq ".") { continue }
        if ($segment -eq "..") {
            if ($segments.Count -gt 0) { $segments.RemoveAt($segments.Count - 1) }
            continue
        }
        [void]$segments.Add($segment)
    }

    return ($segments -join "/")
}

$trackedSet = New-Object System.Collections.Generic.HashSet[string] ([StringComparer]::OrdinalIgnoreCase)
foreach ($trackedFile in $trackedFiles) {
    [void]$trackedSet.Add(($trackedFile -replace "\\", "/"))
}

# "" first so a specifier that already carries its extension is matched as written.
$candidateExtensions = @("", ".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css")
$importPattern = '(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'']((?:@/|\.{1,2}/)[^"'']+)["'']'
$unresolvedImports = New-Object System.Collections.Generic.List[string]

# Only the repo-root web app is scanned, because only it is built on the VPS. The root
# tsconfig excludes "mobile", and mobile/tsconfig.json maps the same "@/" alias to
# mobile/src instead, so resolving mobile imports against this alias root would be
# wrong. A broken mobile import cannot fail this deploy; option 5's mobile:typecheck
# is what covers that.
foreach ($sourceFile in ($trackedFiles | Where-Object { $_ -match '^src/.*\.(ts|tsx|js|jsx|mjs|cjs)$' })) {
    $contents = Get-Content -LiteralPath $sourceFile -Raw -ErrorAction Stop
    if ([string]::IsNullOrEmpty($contents)) { continue }

    $baseDir = (Split-Path -Parent $sourceFile) -replace "\\", "/"

    foreach ($match in [regex]::Matches($contents, $importPattern)) {
        $specifier = $match.Groups[1].Value
        $target = Resolve-ImportTarget -BaseDir $baseDir -Specifier $specifier

        $resolved = $false
        $existsOnDisk = $false
        foreach ($extension in $candidateExtensions) {
            foreach ($candidate in @("$target$extension", "$target/index$extension")) {
                if ($trackedSet.Contains($candidate)) { $resolved = $true; break }
                if (Test-Path -LiteralPath $candidate -PathType Leaf) { $existsOnDisk = $true }
            }
            if ($resolved) { break }
        }

        if (-not $resolved) {
            if ($existsOnDisk) {
                $unresolvedImports.Add("  $sourceFile -> $specifier   (exists locally but is not in Git)")
            } else {
                $unresolvedImports.Add("  $sourceFile -> $specifier   (not found)")
            }
        }
    }
}

if ($unresolvedImports.Count -gt 0) {
    $newline = [Environment]::NewLine
    $details = ($unresolvedImports | Sort-Object -Unique) -join $newline
    throw @"
Deploy would ship an incomplete file set - the VPS build would fail with "Module not found".

$details

Files marked "exists locally but is not in Git" are new files you have not staged yet.
Only Git-tracked files are uploaded, so run `git add` on them and try again.
Nothing was uploaded and production was not contacted.
"@
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
