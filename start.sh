#!/usr/bin/env bash
set -e
echo "SkySathi 2.1 — starting full stack (db + redis + api + web)…"
docker compose up --build -d
echo ""
echo "  Web:      http://localhost:3000"
echo "  API:      http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "Logs: docker compose logs -f    Stop: ./stop.sh"
