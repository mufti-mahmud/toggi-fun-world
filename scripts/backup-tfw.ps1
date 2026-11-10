<#
.SYNOPSIS
  Daily off-site backup of the live Toggi Fun World portal.

.DESCRIPTION
  Signs in with SITE_PASSWORD from .env.northflank.json, downloads the full database export
  (/api/db/export) and, if the Northflank CLI is signed in, the uploaded ride photos.
  Each run writes to <BackupRoot>\<yyyy-MM-dd>; folders older than -KeepDays are deleted.
  Northflank's free plan has no volume backups, so this copy is the only backup.

  Restore: sign in to the portal, then POST the JSON file to /api/db/import
  (or ask the developer to do it).
#>
param(
  [string]$BackupRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'TFW-Backups'),
  [int]$KeepDays = 30,
  [string]$EnvFile = (Join-Path (Split-Path $PSScriptRoot -Parent) '.env.northflank.json')
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$logFile = Join-Path $BackupRoot 'backup.log'

function Write-Log([string]$message) {
  $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $message
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Output $line
}

try {
  if (-not (Test-Path $EnvFile)) { throw "Settings file not found: $EnvFile" }
  $settings = (Get-Content $EnvFile -Raw | ConvertFrom-Json).runtimeEnvironment
  $baseUrl = ([string]$settings.APP_URL).TrimEnd('/')
  if (-not $baseUrl -or -not $settings.SITE_PASSWORD) { throw 'APP_URL or SITE_PASSWORD missing in the settings file.' }

  $dayFolder = Join-Path $BackupRoot (Get-Date -Format 'yyyy-MM-dd')
  New-Item -ItemType Directory -Force -Path $dayFolder | Out-Null

  $loginBody = @{ password = [string]$settings.SITE_PASSWORD } | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -ContentType 'application/json' `
    -Body $loginBody -SessionVariable session -TimeoutSec 60 | Out-Null

  $exportFile = Join-Path $dayFolder ('TFW_DB_{0:yyyy-MM-dd_HHmm}.json' -f (Get-Date))
  $tempFile = "$exportFile.partial"
  Invoke-WebRequest -Uri "$baseUrl/api/db/export" -WebSession $session -OutFile $tempFile -TimeoutSec 300 -UseBasicParsing

  # A truncated or HTML response must not replace a good backup.
  $export = Get-Content $tempFile -Raw | ConvertFrom-Json
  if (-not $export.config -or -not $export.data) { throw 'Export is missing config or data.' }
  Move-Item -Force $tempFile $exportFile
  $sizeKb = [math]::Round((Get-Item $exportFile).Length / 1KB)
  Write-Log "OK database: $exportFile ($sizeKb KB, version $($export.version))"

  try {
    $imagesFolder = Join-Path $dayFolder 'images'
    $cliOutput = & npx -y @northflank/cli download service file --projectId toggi-fun-world --serviceId tfw `
      --localPath $imagesFolder --remotePath /app/data/images 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($cliOutput | Select-Object -Last 1) }
    $count = @(Get-ChildItem $imagesFolder -File -ErrorAction SilentlyContinue).Count
    Write-Log "OK photos: $count file(s)"
  } catch {
    Write-Log "WARN photos skipped (sign in with: npx @northflank/cli login): $_"
  }

  $cutoff = (Get-Date).Date.AddDays(-$KeepDays)
  Get-ChildItem $BackupRoot -Directory |
    Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' -and [datetime]::ParseExact($_.Name, 'yyyy-MM-dd', $null) -lt $cutoff } |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force; Write-Log "Pruned $($_.Name)" }
} catch {
  Write-Log "FAILED: $_"
  if ($tempFile -and (Test-Path $tempFile)) { Remove-Item $tempFile -Force }
  exit 1
}
