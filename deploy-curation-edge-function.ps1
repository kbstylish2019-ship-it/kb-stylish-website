# Deploy Curation Edge Function with NO JWT verification (public access)
Write-Host "Deploying get-curated-content Edge Function..." -ForegroundColor Cyan

# Deploy with --no-verify-jwt flag for public access
supabase functions deploy get-curated-content --no-verify-jwt --project-ref poxjcaogjupsplrcliau

Write-Host "`nDeployment complete! Testing..." -ForegroundColor Green

# Test the deployed function
Write-Host "`n=== Testing Trending Products ===" -ForegroundColor Cyan
$headers = @{
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxODE5MzUsImV4cCI6MjA2ODc1NzkzNX0.KAj8qHVnNmY2b6K-3B7xJ2qLEKEm7XhJxoJ1MfqG-nU'
}
try {
    $result = Invoke-RestMethod -Uri "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/get-curated-content?action=fetch_trending_products&limit=5" -Headers $headers
    Write-Host "SUCCESS! Got $($result.data.Count) products" -ForegroundColor Green
    $result | ConvertTo-Json -Depth 3
} catch {
    Write-Host "FAILED: $_" -ForegroundColor Red
}
