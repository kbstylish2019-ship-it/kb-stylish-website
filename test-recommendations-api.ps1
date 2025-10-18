# Test recommendations API for Silk Blouse
$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxODE5MzUsImV4cCI6MjA2ODc1NzkzNX0.KAj8qHVnNmY2b6K-3B7xJ2qLEKEm7XhJxoJ1MfqG-nU'
}

# Silk Blouse product ID
$silkBlouseId = "1ecce5d1-c1f1-4648-b356-3444a42084ee"

Write-Host "Testing recommendations for Silk Blouse..." -ForegroundColor Cyan
try {
    $result = Invoke-RestMethod -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_recommendations&product_id=$silkBlouseId&limit=10" -Headers $headers -ErrorAction Stop
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "Found $($result.data.Count) recommendations" -ForegroundColor Yellow
    $result | ConvertTo-Json -Depth 5
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
