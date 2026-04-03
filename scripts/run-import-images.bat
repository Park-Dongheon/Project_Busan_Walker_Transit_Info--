@echo off
set "SCRIPT_DIR=%~dp0"

powershell.exe -ExecutionPolicy Bypass -File "%SCRIPT_DIR%upload-attraction-images.ps1" ^
  -S3Bucket "busan-walker-images" ^
  -CloudFrontBaseUrl "https://d2vtmeghyui1va.cloudfront.net" ^
  -S3Region "ap-northeast-2" ^
  -S3KeyPrefix "local" ^
  -ImageDir "..\image"

pause
