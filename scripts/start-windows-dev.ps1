$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
docker compose -f docker-compose.dev.yml up --build -d
Write-Host "Dev frontend is running at http://localhost:3001"
Write-Host "Dev backend is running at http://localhost:8000"