Write-Host "SkySathi 2.1 - starting full stack (db + redis + api + web)..." -ForegroundColor Cyan
docker compose up --build -d
Write-Host ""
Write-Host "  Web:      http://localhost:3000" -ForegroundColor Green
Write-Host "  API:      http://localhost:8000" -ForegroundColor Green
Write-Host "  API docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Logs: docker compose logs -f    Stop: .\stop.ps1"
