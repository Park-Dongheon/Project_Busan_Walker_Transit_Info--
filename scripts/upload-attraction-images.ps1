param(
    [string]$S3Bucket = "busan-walker-images",
    [string]$CloudFrontBaseUrl = "https://d2vtmeghyui1va.cloudfront.net",
    [string]$SpringProfile = "local",
    [string]$S3Region = "ap-northeast-2",
    [string]$S3KeyPrefix = "local",
    [string]$ImageDir = "",
    [switch]$OverwriteExisting
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot "..\busan-walker-backend\busan-walker"))

function Resolve-ScriptRelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $scriptRoot $PathValue))
}

$resolvedImageDir = if ($ImageDir) {
    Resolve-ScriptRelativePath -PathValue $ImageDir
} else {
    Resolve-ScriptRelativePath -PathValue "..\image"
}

$mvnwPath = Join-Path $projectRoot "mvnw.cmd"
if (-not (Test-Path $mvnwPath)) {
    throw "Cannot find backend project root. Expected mvnw.cmd at: $mvnwPath"
}

if (-not (Test-Path $resolvedImageDir -PathType Container)) {
    throw "Image directory not found: $resolvedImageDir"
}

$env:SPRING_PROFILES_ACTIVE = $SpringProfile

$env:BH_FILE_PROVIDER = "s3"
$env:BH_FILE_S3_BUCKET = $S3Bucket
$env:BH_FILE_S3_REGION = $S3Region
$env:BH_FILE_PUBLIC_BASE_URL = $CloudFrontBaseUrl
$env:BH_FILE_S3_KEY_PREFIX = $S3KeyPrefix

$env:BH_ATTRACTION_IMAGE_IMPORT_ENABLED = "true"
$env:BH_ATTRACTION_IMAGE_IMPORT_IMAGE_DIR = $resolvedImageDir
$env:BH_ATTRACTION_IMAGE_IMPORT_OVERWRITE_EXISTING = $(if ($OverwriteExisting.IsPresent) { "true" } else { "false" })
$env:BH_ATTRACTION_IMAGE_IMPORT_EXIT_AFTER_RUN = "true"

Push-Location $projectRoot
try {
    Write-Host "[busan-walker] Starting attraction image import" -ForegroundColor Cyan
    Write-Host "  provider              : $env:BH_FILE_PROVIDER"
    Write-Host "  s3 bucket             : $env:BH_FILE_S3_BUCKET"
    Write-Host "  s3 region             : $env:BH_FILE_S3_REGION"
    Write-Host "  cloudfront/public url : $env:BH_FILE_PUBLIC_BASE_URL"
    Write-Host "  s3 key prefix         : $env:BH_FILE_S3_KEY_PREFIX"
    Write-Host "  image dir             : $env:BH_ATTRACTION_IMAGE_IMPORT_IMAGE_DIR"
    Write-Host "  overwrite existing    : $env:BH_ATTRACTION_IMAGE_IMPORT_OVERWRITE_EXISTING"
    & $mvnwPath spring-boot:run
} finally {
    Pop-Location
}
