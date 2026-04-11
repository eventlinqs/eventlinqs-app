# killdev.ps1 — Kill all zombie node.exe processes holding dev ports
Write-Host "Killing all node.exe processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: All node processes terminated" -ForegroundColor Green
} else {
    Write-Host "No node processes were running" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "You can now run 'npm run dev' cleanly on port 3000" -ForegroundColor White
