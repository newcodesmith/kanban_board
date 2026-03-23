#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
docker compose -f docker-compose.dev.yml up --build -d
echo "Dev frontend is running at http://localhost:3001"
echo "Dev backend is running at http://localhost:8000"