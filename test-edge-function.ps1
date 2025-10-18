# Test Curation Edge Function
$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxODE5MzUsImV4cCI6MjA2ODc1NzkzNX0.KAj8qHVnNmY2b6K-3B7xJ2qLEKEm7XhJxoJ1MfqG-nU'
    'Content-Type' = 'application/json'
}

Write-Host "`n=== Testing Trending Products ===" -ForegroundColor Cyan
$trending = Invoke-WebRequest -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_trending_products&limit=5" -Headers $headers -UseBasicParsing
Write-Host "Status: $($trending.StatusCode)" -ForegroundColor $(if ($trending.StatusCode -eq 200) { 'Green' } else { 'Red' })
Write-Host "Response: $($trending.Content)" -ForegroundColor Yellow

Write-Host "`n=== Testing Featured Brands ===" -ForegroundColor Cyan
$brands = Invoke-WebRequest -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_featured_brands&limit=5" -Headers $headers -UseBasicParsing
Write-Host "Status: $($brands.StatusCode)" -ForegroundColor $(if ($brands.StatusCode -eq 200) { 'Green' } else { 'Red' })
Write-Host "Response: $($brands.Content)" -ForegroundColor Yellow
