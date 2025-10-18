# Test Curation Edge Function with error handling
$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxODE5MzUsImV4cCI6MjA2ODc1NzkzNX0.KAj8qHVnNmY2b6K-3B7xJ2qLEKEm7XhJxoJ1MfqG-nU'
    'Content-Type' = 'application/json'
}

Write-Host "`n=== Testing Trending Products ===" -ForegroundColor Cyan
try {
    $trending = Invoke-RestMethod -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_trending_products&limit=5" -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "Status: 200" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Yellow
    $trending | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error Response:" -ForegroundColor Red
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    $responseBody = $reader.ReadToEnd()
    Write-Host $responseBody -ForegroundColor Yellow
}

Write-Host "`n=== Testing Featured Brands ===" -ForegroundColor Cyan
try {
    $brands = Invoke-RestMethod -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_featured_brands&limit=5" -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "Status: 200" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Yellow
    $brands | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error Response:" -ForegroundColor Red
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    $responseBody = $reader.ReadToEnd()
    Write-Host $responseBody -ForegroundColor Yellow
}
