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

# Sign in to get a valid token
$email = 'user1.test2@test.local'
$password = 'Password123!'
$signInUri = "$BASE/auth/v1/token?grant_type=password"
$signInBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$signInHeaders = @{ apikey = $ANON_KEY; 'Content-Type' = 'application/json' }

Write-Host "Testing Edge Function Diagnostics"
Write-Host "================================="
Write-Host ""

try {
    $signInResp = Invoke-RestMethod -Method POST -Uri $signInUri -Headers $signInHeaders -Body $signInBody
    $token = $signInResp.access_token
    Write-Host "Got auth token for: $email"
} catch {
    Write-Host "Sign-in failed, testing without auth"
    $token = $null
}

$EDGE = "$BASE/functions/v1/cart-manager"

Write-Host ""
Write-Host "Test 1: Diagnostic without auth"
Write-Host "--------------------------------"
$body = @{ action = 'diag' } | ConvertTo-Json -Compress
$headers = @{ 'Content-Type' = 'application/json' }

try {
    $resp = Invoke-RestMethod -Method POST -Uri $EDGE -Headers $headers -Body $body
    Write-Host "Response:"
    $resp | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_"
}

if ($token) {
    Write-Host ""
    Write-Host "Test 2: Diagnostic WITH auth"
    Write-Host "-----------------------------"
    $headers = @{ 
        'Content-Type' = 'application/json'
        'Authorization' = "Bearer $token"
    }
    
    try {
        $resp = Invoke-RestMethod -Method POST -Uri $EDGE -Headers $headers -Body $body
        Write-Host "Response:"
        $resp | ConvertTo-Json -Depth 10
    } catch {
        Write-Host "Failed: $_"
    }
}

Write-Host ""
Write-Host "Test 3: Diagnostic with SERVICE_ROLE key"
Write-Host "-----------------------------------------"
$headers = @{ 
    'Content-Type' = 'application/json'
    'Authorization' = "Bearer $SERVICE_KEY"
}

try {
    $resp = Invoke-RestMethod -Method POST -Uri $EDGE -Headers $headers -Body $body
    Write-Host "Response:"
    $resp | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_"
}
