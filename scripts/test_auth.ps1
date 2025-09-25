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

Write-Host "Testing auth with base: $BASE"
Write-Host ""

# Create a test user
$email = "test" + (Get-Random) + "@example.com"
$password = 'Password123!'

Write-Host "Creating user: $email"
$signupUri = "$BASE/auth/v1/signup"
$signupBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$signupHeaders = @{ apikey = $ANON_KEY; 'Content-Type' = 'application/json' }

try {
    $signupResp = Invoke-RestMethod -Method POST -Uri $signupUri -Headers $signupHeaders -Body $signupBody
    Write-Host "Signup successful"
    $token = $signupResp.access_token
} catch {
    Write-Host "Signup failed: $_"
    exit 1
}

Write-Host ""
Write-Host "Testing Edge Function with token..."
$EDGE = "$BASE/functions/v1/cart-manager"

# Test with simple get action
$testBody = @{ action = 'get' } | ConvertTo-Json -Compress
$testHeaders = @{ 
    'Content-Type' = 'application/json'
    'Authorization' = "Bearer $token"
}

Write-Host "Calling Edge Function at: $EDGE"
Write-Host "Headers: $($testHeaders | ConvertTo-Json -Compress)"
Write-Host ""

try {
    $resp = Invoke-WebRequest -Method POST -Uri $EDGE -Headers $testHeaders -Body $testBody
    Write-Host "SUCCESS! Status: $($resp.StatusCode)"
    Write-Host "Response: $($resp.Content)"
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
