$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
docker compose -f docker-compose.dev.yml down
Write-Host "Dev app has been stopped."