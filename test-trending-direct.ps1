# Test trending products endpoint directly
$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxODE5MzUsImV4cCI6MjA2ODc1NzkzNX0.KAj8qHVnNmY2b6K-3B7xJ2qLEKEm7XhJxoJ1MfqG-nU'
}

Write-Host "Testing trending products..." -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_trending_products&limit=5" -Headers $headers -ErrorAction Stop
    Write-Host "SUCCESS!" -ForegroundColor Green
    $result | ConvertTo-Json -Depth 3
} catch {
    Write-Host "FAILED!" -ForegroundColor Red
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Yellow
    
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    $errorBody = $reader.ReadToEnd()
    Write-Host "Error Response:" -ForegroundColor Yellow
    Write-Host $errorBody -ForegroundColor Red
}

Write-Host "`nTesting featured brands (for comparison)..." -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_featured_brands&limit=5" -Headers $headers -ErrorAction Stop
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "Got $($result.data.Count) brands" -ForegroundColor Green
} catch {
    Write-Host "FAILED!" -ForegroundColor Red
}
