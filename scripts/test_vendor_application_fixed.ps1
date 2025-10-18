# ============================================================================
# Test Script: Vendor Application Submission (After Fix)
# ============================================================================
# This script tests the fixed vendor application submission flow
# Run this AFTER applying the database migration and deploying the Edge Function

param(
    [string]$TestEmail = "",
    [string]$TestPassword = ""
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Vendor Application Submission Test" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Load environment variables
if (Test-Path .env.local) {
    Get-Content .env.local | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)\s*=\s*(.+)\s*$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
    Write-Host "✅ Loaded environment variables from .env.local" -ForegroundColor Green
} else {
    Write-Host "⚠️  .env.local not found. Make sure environment variables are set." -ForegroundColor Yellow
}

$supabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL
$anonKey = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY

if (-not $supabaseUrl -or -not $anonKey) {
    Write-Host "❌ ERROR: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set" -ForegroundColor Red
    exit 1
}

# Get test credentials
if (-not $TestEmail) {
    $TestEmail = Read-Host "Enter test user email"
}
if (-not $TestPassword) {
    $TestPassword = Read-Host "Enter test user password" -AsSecureString
    $TestPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TestPassword)
    )
}

Write-Host ""
Write-Host "==> Step 1: Authenticating user..." -ForegroundColor Cyan

try {
    $loginBody = @{
        email = $TestEmail
        password = $TestPassword
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod `
        -Uri "$supabaseUrl/auth/v1/token?grant_type=password" `
        -Method POST `
        -Headers @{
            "apikey" = $anonKey
            "Content-Type" = "application/json"
        } `
        -Body $loginBody

    $accessToken = $loginResponse.access_token
    $userId = $loginResponse.user.id

    Write-Host "✅ Authentication successful" -ForegroundColor Green
    Write-Host "   User ID: $userId" -ForegroundColor Gray
    Write-Host "   Token (first 20 chars): $($accessToken.Substring(0, 20))..." -ForegroundColor Gray
}
catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "==> Step 2: Submitting vendor application..." -ForegroundColor Cyan

$randomSuffix = Get-Random -Minimum 1000 -Maximum 9999
$applicationData = @{
    business_name = "Test Boutique $randomSuffix"
    business_type = "Boutique"
    contact_name = "Test Owner"
    email = "boutique$randomSuffix@test.com"
    phone = "9841234567"
    website = "https://testboutique$randomSuffix.com"
    payout_method = "esewa"
    esewa_number = "9841234567"
} | ConvertTo-Json

Write-Host "   Business Name: Test Boutique $randomSuffix" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod `
        -Uri "$supabaseUrl/functions/v1/submit-vendor-application" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $accessToken"
            "Content-Type" = "application/json"
            "apikey" = $anonKey
        } `
        -Body $applicationData

    Write-Host ""
    Write-Host "✅ Application submitted successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor White
    
    if ($response.success) {
        Write-Host ""
        Write-Host "================================================" -ForegroundColor Green
        Write-Host "🎉 TEST PASSED - FIX IS WORKING!" -ForegroundColor Green
        Write-Host "================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Verify application in admin dashboard" -ForegroundColor White
        Write-Host "2. Check database: SELECT * FROM vendor_profiles WHERE user_id = '$userId'" -ForegroundColor White
        Write-Host "3. Review Edge Function logs for any warnings" -ForegroundColor White
        exit 0
    } else {
        Write-Host ""
        Write-Host "⚠️  Response indicates failure" -ForegroundColor Yellow
        Write-Host "Error: $($response.error)" -ForegroundColor Red
        Write-Host "Error Code: $($response.error_code)" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host ""
    Write-Host "❌ Application submission failed" -ForegroundColor Red
    Write-Host "   Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        try {
            $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host ""
            Write-Host "Error Details:" -ForegroundColor Yellow
            $errorJson | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor White
            
            if ($errorJson.diag) {
                Write-Host ""
                Write-Host "Diagnostics:" -ForegroundColor Yellow
                $errorJson.diag | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor White
            }
        }
        catch {
            Write-Host "   Raw error: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Verify database migration was applied successfully" -ForegroundColor White
    Write-Host "2. Verify Edge Function was redeployed with the fix" -ForegroundColor White
    Write-Host "3. Check Edge Function logs in Supabase dashboard" -ForegroundColor White
    Write-Host "4. Verify RPC signature: SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'submit_vendor_application_secure';" -ForegroundColor White
    
    exit 1
}
