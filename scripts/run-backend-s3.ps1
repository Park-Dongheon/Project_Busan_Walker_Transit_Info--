param(
    [string]$AwsProfile = "busan-hiker",
    [string]$SpringProfile = "local",
    [string]$S3Bucket = "busan-walker-images",
    [string]$CloudFrontBaseUrl = "https://d2vtmeghyui1va.cloudfront.net",
    [string]$S3Region = "ap-northeast-2",
    [string]$S3KeyPrefix = "local"
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Join-Path $scriptRoot "..\busan-walker-backend\busan-walker"
$projectRoot = [System.IO.Path]::GetFullPath($projectRoot)

$mvnwPath = Join-Path $projectRoot "mvnw.cmd"
if (-not (Test-Path $mvnwPath)) {
    throw "Cannot find backend project root. Expected mvnw.cmd at: $mvnwPath"
}

$env:SPRING_PROFILES_ACTIVE = $SpringProfile
$env:AWS_PROFILE = $AwsProfile
$env:AWS_REGION = $S3Region

$env:BH_FILE_PROVIDER = "s3"
$env:BH_FILE_S3_BUCKET = $S3Bucket
$env:BH_FILE_S3_REGION = $S3Region
$env:BH_FILE_PUBLIC_BASE_URL = $CloudFrontBaseUrl
$env:BH_FILE_S3_KEY_PREFIX = $S3KeyPrefix

# Normal API server run (not attraction batch mode)
$env:BH_ATTRACTION_IMAGE_IMPORT_ENABLED = "false"
$env:BH_ATTRACTION_IMAGE_IMPORT_EXIT_AFTER_RUN = "false"

Push-Location $projectRoot
try {
    Write-Host "[busan-walker] Starting backend in S3 mode" -ForegroundColor Cyan
    Write-Host "  spring profile        : $env:SPRING_PROFILES_ACTIVE"
    Write-Host "  aws profile           : $env:AWS_PROFILE"
    Write-Host "  provider              : $env:BH_FILE_PROVIDER"
    Write-Host "  s3 bucket             : $env:BH_FILE_S3_BUCKET"
    Write-Host "  s3 region             : $env:BH_FILE_S3_REGION"
    Write-Host "  cloudfront/public url : $env:BH_FILE_PUBLIC_BASE_URL"
    Write-Host "  s3 key prefix         : $env:BH_FILE_S3_KEY_PREFIX"
    & $mvnwPath spring-boot:run
} finally {
    Pop-Location
}
