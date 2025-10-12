$url = "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/order-worker?max_jobs=10"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjQ1MDUsImV4cCI6MjA3MzE0MDUwNX0.5gcfRhvo4PbfSXVPRsJhbmSn046-yjwaDiC92VGo62w"

Write-Host "Triggering order-worker..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -TimeoutSec 30
    Write-Host "Success!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
