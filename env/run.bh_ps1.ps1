# ============================================================
# Busan Hiker - Runner (PowerShell / UTF-8)
#
# 목적
# - 로컬 개발자가 "한 번의 실행"으로 빌드 + 실행까지 수행할 수 있게 한다.
# - 실행 디렉터리(Working Directory)를 고정하여 Spring config 로딩/로그 경로를 안정화한다.
# - Maven Wrapper를 우선 사용하여 빌드 재현성을 확보한다.
#
# 사용 예시
#   1) 기본 실행(필요 시 자동 빌드): .\run.bh_ps1.ps1
#   2) clean 후 실행:             .\run.bh_ps1.ps1 -Clean
#   3) 테스트 포함 빌드 후 실행:     .\run.bh_ps1.ps1 -RunTests
#   4) 프로젝트 경로 수동 지정:      .\run.bh_ps1.ps1 -ProjectDir "D:\...\busan-hiker"
# ============================================================

[CmdletBinding()]
param(
  # 애플리케이션 모듈 디렉터리(pom.xml이 있는 폴더)
  # - 기본값은 스크립트 위치 기준으로 자동 계산
  [Parameter(Mandatory = $false)]
  [string]$ProjectDir = "",

  # clean 수행 여부
  [Parameter(Mandatory = $false)]
  [switch]$Clean,

  # 테스트 실행 여부 (기본은 빠른 실행을 위해 SkipTests)
  [Parameter(Mandatory = $false)]
  [switch]$RunTests,

  # 추가 JVM 옵션이 필요할 때 사용 (예: -Dserver.port=8081)
  [Parameter(Mandatory = $false)]
  [string[]]$JvmArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# 0) 루트/모듈 경로 계산
# - env 폴더에 있는 스크립트가 실행된다는 전제에서,
#   스크립트 디렉터리($PSScriptRoot)의 상위 폴더를 "루트"로 간주한다.
# ------------------------------------------------------------
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  # 프로젝트 구조: <root>\busan-hiker-backend\busan-hiker
  $ProjectDir = Join-Path $rootDir "busan-hiker-backend\busan-hiker"
}

if (-not (Test-Path -LiteralPath $ProjectDir)) {
  throw "ProjectDir not found: $ProjectDir"
}

# ------------------------------------------------------------
# 1) 작업 디렉터리 고정
# - Spring Boot는 실행 디렉터리 기준으로 ./config/application*.yml을 우선 로딩한다.
# - 로그 상대 경로, import 상대 경로도 여기 기준으로 해석된다.
# ------------------------------------------------------------
Push-Location -LiteralPath $ProjectDir
try {
  # ------------------------------------------------------------
  # 2) ENV 로드
  # - .env.bh_ps1.ps1는 '환경변수만'을 정의한다.
  # - 시크릿은 config/application-local-secrets.properties가 단일 소스다.
  # ------------------------------------------------------------
  $envFile = Join-Path $rootDir "env\.env.bh_ps1.ps1"
  if (Test-Path -LiteralPath $envFile) {
    . $envFile
  }

  # ------------------------------------------------------------
  # 3) JAVA 실행 파일 탐색
  # - JAVA_HOME이 유효하면 해당 경로를 사용한다.
  # - 없으면 PATH에서 java를 탐색한다.
  # ------------------------------------------------------------
  $java = $null
  if ($env:JAVA_HOME) {
    $javaCandidate = Join-Path $env:JAVA_HOME "bin\java.exe"
    if (Test-Path -LiteralPath $javaCandidate) {
      $java = $javaCandidate
    }
  }

  if (-not $java) {
    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCmd) { $java = $javaCmd.Source }
  }

  if (-not $java) {
    throw "java 실행파일을 찾을 수 없습니다. JAVA_HOME 또는 PATH를 확인하세요."
  }

  # ------------------------------------------------------------
  # 4) 로그 폴더 보장
  # - 로깅 설정에서 파일 경로를 상대경로로 쓸 수 있어, 루트에 logs 폴더를 둔다.
  # ------------------------------------------------------------
  $logDir = Join-Path $rootDir "logs"
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -Path $logDir -ItemType Directory | Out-Null
  }

  # ------------------------------------------------------------
  # 5) Maven Wrapper 확인
  # - Wrapper가 있으면 항상 Wrapper를 사용(빌드 재현성)
  # - Wrapper가 없으면 mvn을 사용(환경 의존)
  # ------------------------------------------------------------
  $mvnw = Join-Path $ProjectDir "mvnw.cmd"
  $mvn = Get-Command mvn -ErrorAction SilentlyContinue

  $useWrapper = Test-Path -LiteralPath $mvnw
  if (-not $useWrapper -and -not $mvn) {
    throw "Maven 실행파일을 찾을 수 없습니다. mvnw.cmd 또는 mvn을 확인하세요."
  }

  # ------------------------------------------------------------
  # 6) JAR 탐색
  # - target/에서 실행 가능한 jar를 찾는다.
  # - sources/javadoc/plain/original 같은 부가 산출물은 제외한다.
  # ------------------------------------------------------------
  $targetDir = Join-Path $ProjectDir "target"
  $jar = $null

  if (Test-Path -LiteralPath $targetDir) {
    $jar = Get-ChildItem -Path $targetDir -Filter "*.jar" -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -notmatch "original" -and
        $_.Name -notmatch "source" -and
        $_.Name -notmatch "javadoc" -and
        $_.Name -notmatch "plain"
      } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }

  # ------------------------------------------------------------
  # 7) JAR가 없거나 clean 요청이면 빌드 수행
  # - clean은 산출물/캐시 영향으로 생기는 로컬 빌드 꼬임을 가장 빠르게 해결한다.
  # - 기본은 빠른 개발을 위해 테스트를 생략한다.
  # ------------------------------------------------------------
  if ($Clean -or -not $jar) {
    $skipTestsFlag = $RunTests.IsPresent ? $false : $true

    # Maven 공통 인자 구성
    $mvnArgs = @()
    if ($Clean) { $mvnArgs += "clean" }
    $mvnArgs += "package"

    if ($skipTestsFlag) { $mvnArgs += "-DskipTests" }

    if ($useWrapper) {
      & $mvnw -q @mvnArgs
    } else {
      & $mvn.Source -q @mvnArgs
    }

    # 빌드 이후 다시 JAR 탐색
    $jar = Get-ChildItem -Path $targetDir -Filter "*.jar" |
      Where-Object {
        $_.Name -notmatch "original" -and
        $_.Name -notmatch "sources" -and
        $_.Name -notmatch "javadoc" -and
        $_.Name -notmatch "plain"
      } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }

  if (-not $jar) {
    throw "target/*.jar 파일을 찾지 못했습니다."
  }

  # ------------------------------------------------------------
  # 8) Spring Profile 결정
  # - env에서 SPRING_PROFILES_ACTIVE가 없으면 local로 기본값을 둔다
  # ------------------------------------------------------------
  $profile = $env:SPRING_PROFILES_ACTIVE
  if (-not $profile) { $profile = "local" }

  # ------------------------------------------------------------
  # 9) 실행 옵션 구성
  # - config/ 디렉터리를 추가 설정 경로로 지정하면,
  #   IDE/CLI/스크립트 실행 방식 차이로 인한 설정 누락을 줄일 수 있다.
  # ------------------------------------------------------------
  $configDir = Join-Path $ProjectDir "config"

  $finalJvmArgs = @(
    "-Dspring.profiles.active=$profile",
    "-Dspring.output.ansi.enabled=$env:SPRING_OUTPUT_ANSI_ENABLED",
    "-Duser.timezone=Asia/Seoul",
    "-Dspring.config.additional-location=optional:file:./config/"
  )

  # 호출자가 추가로 전달한 JVM 옵션을 뒤에 덧붙여 override 가능하게 한다.
  if  ($JvmArgs -and $JvmArgs.Count -gt 0) {
    $finalJvmArgs += $JvmArgs
  }

  # ------------------------------------------------------------
  # 10) 실행 정보 출력
  # - 장애가 났을 때, "어떤 경로/프로파일/자바로 실행했는지"가 1차 진단 포인트이다.
  # ------------------------------------------------------------
  Write-Host "============================================================"
  Write-Host "ROOT DIR        :" $rootDir
  Write-Host "PROJECT DIR     :" $ProjectDir
  Write-Host "WORKING DIR     :" (Get-Location)
  Write-Host "JAVA            :" $java
  Write-Host "PROFILE         :" $profile
  Write-Host "CONFIG DIR      :" $configDir
  Write-Host "JAR             :" $jar.FullName
  Write-Host "JVM ARGS        :" ($finalJvmArgs -join " ")
  Write-Host "============================================================"

  # --------------------------------------------------------
  # 11) 실행
  # - java -jar 방식은 운영 실행과 동일한 형태라서 로컬에서도 일관성이 높다.
  # --------------------------------------------------------
  & $java @finalJvmArgs -jar $jar.FullName
}
finally {
  Pop-Location
}