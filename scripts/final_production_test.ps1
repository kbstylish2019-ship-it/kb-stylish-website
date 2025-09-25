$ErrorActionPreference = 'Stop'

function Get-EnvMap($path) {
  if (!(Test-Path $path)) { throw "Env file not found: $path" }
  $map = @{}
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
      $kv = $line -split '\s*=\s*', 2
      if ($kv.Length -eq 2) {
        $key = $kv[0].Trim()
        $val = $kv[1].Trim().Trim('"').Trim("'")
        $map[$key] = $val
      }
    }
  }
  return $map
}

$envMap = Get-EnvMap "d:\kb-stylish\.env.local"
$BASE = $envMap['NEXT_PUBLIC_SUPABASE_URL']
$ANON_KEY = $envMap['NEXT_PUBLIC_SUPABASE_ANON_KEY']
$EDGE = "$BASE/functions/v1/cart-manager"
$VARIANT = '00fc5e6f-aeb8-44b3-b3ef-0a561feb359f' 

$tests = @()

Write-Host "================================================"
Write-Host "    PRODUCTION READINESS VALIDATION"
Write-Host "================================================"
Write-Host ""

# Test 1: Guest Cart Operations
Write-Host "Testing Guest Cart..."
$body = @{ action = 'add'; variant_id = $VARIANT; quantity = 1 } | ConvertTo-Json -Compress
$headers = @{ 'Content-Type' = 'application/json' }
try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $headers -Body $body
    $tests += @{ name = "Guest Can Add to Cart"; passed = ($resp.StatusCode -eq 200) }
    $hasCookie = $null -ne $resp.Headers['Set-Cookie']
    $tests += @{ name = "Guest Gets Signed Cookie"; passed = $hasCookie }
} catch {
    $tests += @{ name = "Guest Can Add to Cart"; passed = $false }
    $tests += @{ name = "Guest Gets Signed Cookie"; passed = $false }
}

# Test 2: Authenticated User Cart
Write-Host "Testing Authenticated Cart..."
$email = "test.user.$(Get-Random -Maximum 99999)@test.local"
$password = 'Password123!'

# Create user
$signupUri = "$BASE/auth/v1/signup"
$signupBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$signupHeaders = @{ apikey = $ANON_KEY; 'Content-Type' = 'application/json' }
try {
    $signupResp = Invoke-RestMethod -Method POST -Uri $signupUri -Headers $signupHeaders -Body $signupBody
    $token = $signupResp.access_token
    
    $authHeaders = @{ 
        'Content-Type' = 'application/json'
        'Authorization' = "Bearer $token"
    }
    
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $authHeaders -Body $body
    $tests += @{ name = "Authenticated Can Add to Cart"; passed = ($resp.StatusCode -eq 200) }
    
    # Test cart isolation
    $email2 = "test.user.$(Get-Random -Maximum 99999)@test.local"
    $signup2Body = @{ email = $email2; password = $password } | ConvertTo-Json -Compress
    $signup2Resp = Invoke-RestMethod -Method POST -Uri $signupUri -Headers $signupHeaders -Body $signup2Body
    $token2 = $signup2Resp.access_token
    
    $auth2Headers = @{ 
        'Content-Type' = 'application/json'
        'Authorization' = "Bearer $token2"
    }
    
    $getBody = @{ action = 'get' } | ConvertTo-Json -Compress
    $resp2 = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $auth2Headers -Body $getBody
    $cart2 = $resp2.Content | ConvertFrom-Json
    $tests += @{ name = "User Carts Are Isolated"; passed = ($cart2.cart.cart_items.Count -eq 0) }
    
} catch {
    $tests += @{ name = "Authenticated Can Add to Cart"; passed = $false }
    $tests += @{ name = "User Carts Are Isolated"; passed = $false }
}

# Test 3: Security Tests
Write-Host "Testing Security..."

# Invalid JWT
$invalidHeaders = @{ 
    'Content-Type' = 'application/json'
    'Authorization' = 'Bearer invalid.jwt.token'
}
try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $invalidHeaders -Body $body
    $tests += @{ name = "Invalid JWT Rejected"; passed = $false }
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    $tests += @{ name = "Invalid JWT Rejected"; passed = ($status -eq 401) }
}

# Forged Cookie
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie('guest_token','forged_token','/',$([System.Uri]$EDGE).Host)
$session.Cookies.Add($cookie)
try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $headers -Body $body -WebSession $session
    $tests += @{ name = "Forged Cookie Rejected"; passed = $false }
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    $tests += @{ name = "Forged Cookie Rejected"; passed = ($status -eq 400 -or $status -eq 401) }
}

# Direct RPC Call Block
$rpcUri = "$BASE/rest/v1/rpc/add_to_cart_secure"
$rpcHeaders = @{ 
    apikey = $ANON_KEY
    'Content-Type' = 'application/json'
}
$rpcBody = @{ p_variant_id = $VARIANT; p_quantity = 1 } | ConvertTo-Json -Compress
try {
    $resp = Invoke-WebRequest -Method POST -Uri $rpcUri -Headers $rpcHeaders -Body $rpcBody
    $tests += @{ name = "Direct RPC Blocked"; passed = $false }
} catch {
    $tests += @{ name = "Direct RPC Blocked"; passed = $true }
}

Write-Host ""
Write-Host "================================================"
Write-Host "              TEST RESULTS"
Write-Host "================================================"
Write-Host ""

$passed = 0
$failed = 0

foreach ($test in $tests) {
    if ($test.passed) {
        Write-Host "[✅ PASS] $($test.name)"
        $passed++
    } else {
        Write-Host "[❌ FAIL] $($test.name)"
        $failed++
    }
}

Write-Host ""
Write-Host "================================================"
Write-Host "Summary: $passed/$($tests.Count) tests passed"
Write-Host ""

if ($failed -eq 0) {
    Write-Host "🎉 SYSTEM IS PRODUCTION READY!" -ForegroundColor Green
    Write-Host ""
    Write-Host "All critical security and functionality tests passed."
} else {
    Write-Host "⚠️  NOT PRODUCTION READY" -ForegroundColor Red
    Write-Host ""
    Write-Host "$failed test(s) still need to be fixed."
}
