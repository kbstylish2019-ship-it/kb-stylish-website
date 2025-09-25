$ErrorActionPreference = 'Stop'

$EDGE = "https://poxjcaogjupsplrcliau.supabase.co/functions/v1/cart-manager"
$VARIANT = "00fc5e6f-aeb8-44b3-b3ef-0a561feb359f" # Business Blazer variant with stock

Write-Host "Testing Guest Cart Functionality"
Write-Host "================================="
Write-Host ""

# Test 1: Guest can add to cart without auth
Write-Host "Test 1: Guest add to cart (no auth)"
$body = @{ action = 'add'; variant_id = $VARIANT; quantity = 1 } | ConvertTo-Json -Compress
$headers = @{ 'Content-Type' = 'application/json' }

try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $headers -Body $body
    Write-Host "Status: $($resp.StatusCode)"
    $content = $resp.Content | ConvertFrom-Json
    Write-Host "Success: $($content.success)"
    Write-Host "Message: $($content.message)"
    
    # Check if cookie was set
    $cookies = $resp.Headers['Set-Cookie']
    if ($cookies) {
        Write-Host "Cookie set: YES"
        Write-Host "Cookie: $($cookies[0].Substring(0, 50))..."
    } else {
        Write-Host "Cookie set: NO"
    }
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
Write-Host "Test 2: Guest with forged cookie"
$sessionForged = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie('guest_token','totally_fake_token','/',$([System.Uri]$EDGE).Host)
$sessionForged.Cookies.Add($cookie)

try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $headers -Body $body -WebSession $sessionForged
    Write-Host "Status: $($resp.StatusCode)"
    $content = $resp.Content | ConvertFrom-Json
    Write-Host "Success: $($content.success)"
    Write-Host "Message: $($content.message)"
    Write-Host "ERROR: Forged cookie should have been rejected!"
} catch {
    $errorResp = $_.Exception.Response
    if ($errorResp) {
        $reader = New-Object System.IO.StreamReader($errorResp.GetResponseStream())
        $content = $reader.ReadToEnd()
        Write-Host "Good! Forged cookie rejected with status: $([int]$errorResp.StatusCode)"
        Write-Host "Response: $content"
    } else {
        Write-Host "Error: $_"
    }
}
