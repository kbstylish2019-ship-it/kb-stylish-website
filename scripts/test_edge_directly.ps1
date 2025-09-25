# Direct test of Edge Function without authentication
$EDGE = "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cart-manager"

Write-Host "Testing Edge Function directly at: $EDGE"
Write-Host ""

# Test 1: Guest cart (no auth)
Write-Host "Test 1: Guest cart (no auth)"
$body = @{ action = 'get' } | ConvertTo-Json -Compress
$headers = @{ 'Content-Type' = 'application/json' }

try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $headers -Body $body
    Write-Host "SUCCESS! Status: $($resp.StatusCode)"
    $content = $resp.Content | ConvertFrom-Json
    Write-Host "Response: $($content | ConvertTo-Json -Compress)"
} catch {
    $errorResp = $_.Exception.Response
    if ($errorResp) {
        $reader = New-Object System.IO.StreamReader($errorResp.GetResponseStream())
        $content = $reader.ReadToEnd()
        Write-Host "FAILED! Status: $([int]$errorResp.StatusCode)"
        Write-Host "Response: $content"
    } else {
        Write-Host "FAILED! Error: $_"
    }
}

Write-Host ""
Write-Host "Test 2: Check Edge Function health"

# Test OPTIONS for CORS
try {
    $resp = Invoke-WebRequest -Method OPTIONS -Uri $EDGE
    Write-Host "OPTIONS request: Status $($resp.StatusCode)"
} catch {
    Write-Host "OPTIONS failed: $_"
}
