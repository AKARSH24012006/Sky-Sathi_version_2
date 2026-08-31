$a = Read-Host "This DELETES all SkySathi data. Continue? [y/N]"
if ($a -eq "y") { docker compose down -v; Write-Host "Database wiped. .\start.ps1 to begin fresh." }
