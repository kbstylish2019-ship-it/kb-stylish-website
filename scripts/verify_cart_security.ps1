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
$SERVICE_KEY = $envMap['SUPABASE_SERVICE_ROLE_KEY']
if (-not $BASE -or -not $ANON_KEY -or -not $SERVICE_KEY) { throw 'Missing required env vars in .env.local' }

$EDGE = "$BASE/functions/v1/cart-manager"
$VARIANT = '00fc5e6f-aeb8-44b3-b3ef-0a561feb359f' # Business Blazer variant with stock

function New-AdminUser($email, $password) {
  $uri = "$BASE/auth/v1/admin/users"
  $headers = @{ apikey = $SERVICE_KEY; Authorization = "Bearer $SERVICE_KEY"; 'Content-Type' = 'application/json' }
  $body = @{ email = $email; password = $password; email_confirm = $true } | ConvertTo-Json -Compress
  try {
    $resp = Invoke-RestMethod -Method POST -Uri $uri -Headers $headers -Body $body
    return $resp
  } catch {
    if ($_.Exception.Response.StatusCode.Value__ -eq 409) {
      return @{ email = $email; note = 'already exists' }
    }
    throw
  }
}

function SignIn($email, $password) {
  $uri = "$BASE/auth/v1/token?grant_type=password"
  $headers = @{ apikey = $ANON_KEY; 'Content-Type' = 'application/json' }
  $body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
  $resp = Invoke-RestMethod -Method POST -Uri $uri -Headers $headers -Body $body
  return $resp.access_token
}

function Invoke-Edge($bodyObj, $token = $null, [ref]$sessionRef = [ref]$null) {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  if ($sessionRef.Value -ne $null) { $session = $sessionRef.Value }
  $headers = @{ 'Content-Type' = 'application/json' }
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $headers -Body ($bodyObj | ConvertTo-Json -Compress) -WebSession $session
    $json = $resp.Content | ConvertFrom-Json
    if ($sessionRef.Value -eq $null) { $sessionRef.Value = $session }
    return @{ StatusCode = $resp.StatusCode; Body = $json; Cookies = $session.Cookies }
  } catch {
    $resp = $_.Exception.Response
    if ($resp -ne $null) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $content = $reader.ReadToEnd()
      try { $json = $content | ConvertFrom-Json } catch { $json = @{ error = $content } }
      return @{ StatusCode = [int]$resp.StatusCode; Body = $json; Cookies = $session.Cookies }
    }
    throw
  }
}

$results = @()

# Test 1: Authenticated User Cart Isolation
$user1 = 'user1.test+' + (Get-Random) + '@test.local'
$user2 = 'user2.test+' + (Get-Random) + '@test.local'
$pwd = 'Password123!'
New-AdminUser $user1 $pwd | Out-Null
New-AdminUser $user2 $pwd | Out-Null
$tok1 = SignIn $user1 $pwd
$tok2 = SignIn $user2 $pwd

# Debug: Verify tokens directly with auth service
try {
  $chk1 = Invoke-RestMethod -Method GET -Uri "$BASE/auth/v1/user" -Headers @{ apikey = $ANON_KEY; Authorization = "Bearer $tok1" }
  $chk2 = Invoke-RestMethod -Method GET -Uri "$BASE/auth/v1/user" -Headers @{ apikey = $ANON_KEY; Authorization = "Bearer $tok2" }
  $results += @{ test = 'DEBUG auth.getUser user1'; pass = $true; detail = $chk1 }
  $results += @{ test = 'DEBUG auth.getUser user2'; pass = $true; detail = $chk2 }
} catch {
  $results += @{ test = 'DEBUG auth.getUser tokens invalid'; pass = $false; detail = $_.Exception.Message }
}

$r1 = Invoke-Edge @{ action = 'add'; variant_id = $VARIANT; quantity = 2 } $tok1 ([ref]$null)
$r2 = Invoke-Edge @{ action = 'get' } $tok2 ([ref]$null)
$pass1 = ($r1.StatusCode -eq 200 -and $r1.Body.success -eq $true)
$pass2 = ($r2.StatusCode -eq 200 -and $r2.Body.success -eq $true -and ($r2.Body.cart.cart_items.Count -eq 0))
$results += @{ test = '1A user1 add'; pass = $pass1; detail = $r1 }
$results += @{ test = '1B user2 cannot see user1''s items'; pass = $pass2; detail = $r2 }

# Test 2: Guest Cart Session Security
$guest1 = $null; $guest2 = $null
$g1 = Invoke-Edge @{ action = 'add'; variant_id = $VARIANT; quantity = 1 } $null ([ref]$guest1)
$g2 = Invoke-Edge @{ action = 'get' } $null ([ref]$guest2)
$endpointUri = [System.Uri]$EDGE
$cookie1 = ($g1.Cookies.GetCookies($endpointUri) | Where-Object { $_.Name -eq 'guest_token' } | Select-Object -First 1).Value
$cookie2 = ($g2.Cookies.GetCookies($endpointUri) | Where-Object { $_.Name -eq 'guest_token' } | Select-Object -First 1).Value
$pass3 = ($g1.StatusCode -eq 200 -and $g1.Body.success -eq $true -and $cookie1)
$pass4 = ($g2.StatusCode -eq 200 -and $cookie2 -and $cookie1 -ne $cookie2)

# Authenticated with forged cookie - should IGNORE the cookie and use auth
$sessionForged = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$uri = $EDGE
$cookie = New-Object System.Net.Cookie('guest_token','guest_forged_token','/',$([System.Uri]$uri).Host)
$sessionForged.Cookies.Add($cookie)
$forged = Invoke-Edge @{ action = 'get' } $tok1 ([ref]$sessionForged)
# When authenticated, guest cookies are ignored - should return user's cart (200)
$pass5 = ($forged.StatusCode -eq 200 -and $forged.Body.cart.user_id -eq $uid1)
$results += @{ test = '2A guest1 add sets signed cookie'; pass = $pass3; detail = @{ cookie = $cookie1 } }
$results += @{ test = '2B guest2 different cookie'; pass = $pass4; detail = @{ cookie = $cookie2 } }
$results += @{ test = '2C authenticated ignores forged cookie'; pass = $pass5; detail = $forged }

# Test 3: Merge Security and RPC Lockdown
$gmerge = $null
$gm1 = Invoke-Edge @{ action = 'add'; variant_id = $VARIANT; quantity = 1 } $null ([ref]$gmerge)
$merge = Invoke-Edge @{ action = 'merge'; merge_guest_cart = $true } $tok1 ([ref]$gmerge)
$pass6 = ($merge.StatusCode -eq 200 -and $merge.Body.success -eq $true)

# Attack: try to merge someone else's guest cookie (use guest2 from earlier)
# When authenticated, only the user's own previous guest session (if any) can be merged
# Foreign guest cookies are ignored - should return 200 with "No guest cart to merge"
$mergeAttack = Invoke-Edge @{ action = 'merge'; merge_guest_cart = $true } $tok1 ([ref]$guest2)
$pass7 = ($mergeAttack.StatusCode -eq 200 -and $mergeAttack.Body.message -like '*No guest cart to merge*')

# RPC direct call should be blocked for authenticated user
$rpcHeaders = @{ apikey = $ANON_KEY; Authorization = "Bearer $tok1"; 'Content-Type'='application/json' }
try {
  $rpcAttempt = Invoke-WebRequest -Method POST -Uri "$BASE/rest/v1/rpc/merge_carts_secure" -Headers $rpcHeaders -Body (@{ p_user_id = [string]([Guid]::NewGuid()); p_guest_token = 'any' } | ConvertTo-Json -Compress)
  $rpcStatus = $rpcAttempt.StatusCode
} catch {
  if ($_.Exception.Response) { $rpcStatus = [int]$_.Exception.Response.StatusCode } else { throw }
}
$pass8 = ($rpcStatus -ne 200)
$results += @{ test = '3A valid merge works'; pass = $pass6; detail = $merge }
$results += @{ test = '3B foreign guest cookie ignored on merge'; pass = $pass7; detail = $mergeAttack }
$results += @{ test = '3C RPC lockdown blocks direct call'; pass = $pass8; detail = @{ status = $rpcStatus } }

# Test 4: Authentication Bypass Attempts
$noAuth = Invoke-Edge @{ action = 'add'; user_id = [string]([Guid]::NewGuid()); variant_id = $VARIANT; quantity = 1 } $null ([ref]$null)
$pass9 = ($noAuth.StatusCode -eq 200 -and $noAuth.Body.success -eq $true)

$invalidJwtHeaders = @{ Authorization = 'Bearer invalid.jwt.token' }
try {
  $invalid = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $invalidJwtHeaders -Body (@{ action = 'get' } | ConvertTo-Json -Compress) -ContentType 'application/json'
  $invalidStatus = $invalid.StatusCode
} catch {
  $invalidStatus = [int]$_.Exception.Response.StatusCode
}
$pass10 = ($invalidStatus -eq 401)
$results += @{ test = '4A no auth -> guest flow only'; pass = $pass9; detail = $noAuth }
$results += @{ test = '4B invalid JWT -> 401'; pass = $pass10; detail = @{ status = $invalidStatus } }

# Summary
$allPass = ($results | Where-Object { -not $_.pass }).Count -eq 0
Write-Host "==== CART SECURITY VERIFICATION RESULTS ===="
$results | ForEach-Object {
  $status = if ($_.pass) { 'PASS' } else { 'FAIL' }
  Write-Host ("[{0}] {1}" -f $status, $_.test)
  if (-not $_.pass) {
    try {
      $json = ($_.detail | ConvertTo-Json -Depth 6 -Compress)
      Write-Host "  detail: $json"
    } catch {
      Write-Host ("  detail: {0}" -f $_.detail)
    }
  }
}
if ($allPass) { Write-Host 'VERIFICATION COMPLETE. SYSTEM SECURE.' } else { Write-Host 'VERIFICATION FAILED. See failed tests above.' }
