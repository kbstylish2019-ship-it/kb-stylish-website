# Manually Trigger Order Worker to Process Pending Jobs
# Run this when orders aren't being created automatically

$SUPABASE_URL = "https://poxjcaogjupsplrcliau.supabase.co"
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBveGpjYW9nanVwc3BscmNsaWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1NjQ1MDUsImV4cCI6MjA3MzE0MDUwNX0.5gcfRhvo4PbfSXVPRsJhbmSn046-yjwaDiC92VGo62w"

Write-Host "🚀 Triggering order-worker to process pending jobs..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "$SUPABASE_URL/functions/v1/order-worker?max_jobs=10" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $ANON_KEY"
            "Content-Type" = "application/json"
        } `
        -TimeoutSec 30

    Write-Host "✅ Worker triggered successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
    Write-Host ""
    Write-Host "📊 Check results in Supabase:" -ForegroundColor Cyan
    Write-Host "  - Orders table: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/editor/orders"
    Write-Host "  - Job queue: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/editor/job_queue"
    Write-Host "  - Logs: https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/logs/edge-functions"
    
} catch {
    Write-Host "❌ Failed to trigger worker:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "🔍 Check Edge Function logs:" -ForegroundColor Yellow
    Write-Host "   https://supabase.com/dashboard/project/poxjcaogjupsplrcliau/logs/edge-functions"
    exit 1
}
