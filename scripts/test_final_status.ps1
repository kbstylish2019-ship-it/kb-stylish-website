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

Write-Host "======================================="
Write-Host "CART SECURITY FINAL STATUS CHECK"
Write-Host "======================================="
Write-Host ""

# Test 1: Guest can add to cart (no auth, no cookie)
Write-Host "Test 1: Guest Cart (No Auth, No Cookie)"
$body = @{ action = 'add'; variant_id = $VARIANT; quantity = 1 } | ConvertTo-Json -Compress
$headers = @{ 'Content-Type' = 'application/json' }
try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $headers -Body $body
    Write-Host "  Result: PASS (Status $($resp.StatusCode))"
    $hasCookie = $resp.Headers['Set-Cookie'] -ne $null
    Write-Host "  Cookie Set: $hasCookie"
} catch {
    Write-Host "  Result: FAIL (Status $([int]$_.Exception.Response.StatusCode))"
}

# Test 2: Authenticated User Cart
Write-Host ""
Write-Host "Test 2: Authenticated User Cart"
$email = 'user.test.' + (Get-Random -Maximum 99999) + '@test.local'
$password = 'Password123!'
$signInUri = "$BASE/auth/v1/token?grant_type=password"

# Create user first
$signupUri = "$BASE/auth/v1/signup"
$signupBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$signupHeaders = @{ apikey = $ANON_KEY; 'Content-Type' = 'application/json' }
try {
    $signupResp = Invoke-RestMethod -Method POST -Uri $signupUri -Headers $signupHeaders -Body $signupBody
} catch {
    # User might already exist
}

# Sign in
$signInBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$signInHeaders = @{ apikey = $ANON_KEY; 'Content-Type' = 'application/json' }
try {
    $signInResp = Invoke-RestMethod -Method POST -Uri $signInUri -Headers $signInHeaders -Body $signInBody
    $token = $signInResp.access_token
    
    $authHeaders = @{ 
        'Content-Type' = 'application/json'
        'Authorization' = "Bearer $token"
    }
    
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $authHeaders -Body $body
    Write-Host "  Result: PASS (Status $($resp.StatusCode))"
} catch {
    Write-Host "  Result: FAIL"
}

# Test 3: Invalid JWT Rejection
Write-Host ""
Write-Host "Test 3: Invalid JWT Rejection"
$invalidHeaders = @{ 
    'Content-Type' = 'application/json'
    'Authorization' = 'Bearer invalid.jwt.token'
}
try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $invalidHeaders -Body $body
    Write-Host "  Result: FAIL (Should have been rejected)"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    if ($status -eq 401) {
        Write-Host "  Result: PASS (Correctly rejected with 401)"
    } else {
        Write-Host "  Result: FAIL (Wrong status: $status)"
    }
}

# Test 4: Forged Cookie Rejection
Write-Host ""
Write-Host "Test 4: Forged Guest Cookie"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie('guest_token','totally_fake_token','/',$([System.Uri]$EDGE).Host)
$session.Cookies.Add($cookie)

$getBody = @{ action = 'get' } | ConvertTo-Json -Compress
try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $headers -Body $getBody -WebSession $session
    Write-Host "  Result: FAIL (Forged cookie should be rejected)"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    if ($status -eq 400 -or $status -eq 401) {
        Write-Host "  Result: PASS (Correctly rejected)"
    } else {
        Write-Host "  Result: FAIL (Wrong status: $status)"
    }
}

Write-Host ""
Write-Host "======================================="
