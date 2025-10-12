# =====================================================================================
# Booking Cart Clearing Verification Script
# =====================================================================================
# Purpose: Verify that mixed carts (products + bookings) properly clear after checkout
# Date: 2025-09-25
# Engineer: Principal Backend Engineer
# =====================================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Booking Cart Clearing Verification" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Load environment variables
$envPath = Join-Path $PSScriptRoot ".." ".env.local"
if (-not (Test-Path $envPath)) {
    Write-Host "[ERROR] .env.local not found at: $envPath" -ForegroundColor Red
    exit 1
}

Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)\s*=\s*(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

$SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
$SERVICE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_URL -or -not $SERVICE_KEY) {
    Write-Host "[ERROR] Missing environment variables" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Using Supabase URL: $SUPABASE_URL" -ForegroundColor Gray
Write-Host ""

# =====================================================================================
# Helper Functions
# =====================================================================================

function Invoke-SupabaseQuery {
    param(
        [string]$Query,
        [string]$Description
    )
    
    Write-Host "[TEST] $Description" -ForegroundColor Yellow
    
    $body = @{
        query = $Query
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rpc/execute_sql" `
            -Method POST `
            -Headers @{
                "apikey" = $SERVICE_KEY
                "Authorization" = "Bearer $SERVICE_KEY"
                "Content-Type" = "application/json"
            } `
            -Body $body
        
        return $response
    } catch {
        Write-Host "[ERROR] Query failed: $_" -ForegroundColor Red
        return $null
    }
}

function Get-FunctionDefinition {
    param([string]$FunctionName)
    
    Write-Host "[CHECK] Verifying function: $FunctionName" -ForegroundColor Cyan
    
    $query = @"
SELECT 
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
    AND p.proname = '$FunctionName';
"@
    
    try {
        $response = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rpc/execute_sql" `
            -Method POST `
            -Headers @{
                "apikey" = $SERVICE_KEY
                "Authorization" = "Bearer $SERVICE_KEY"
                "Content-Type" = "application/json"
            } `
            -Body (@{ query = $query } | ConvertTo-Json)
        
        return $response
    } catch {
        Write-Host "  ❌ Failed to retrieve function definition" -ForegroundColor Red
        return $null
    }
}

# =====================================================================================
# Test 1: Verify process_order_with_occ function has been updated
# =====================================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Test 1: Function Update Verification" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$functionDef = Get-FunctionDefinition -FunctionName "process_order_with_occ"

if ($functionDef) {
    $defText = $functionDef | ConvertTo-Json -Depth 10
    
    # Check for key indicators that the function was updated
    $checks = @(
        @{ Pattern = "booking_reservations"; Description = "Queries booking_reservations table" },
        @{ Pattern = "v_booking_items_needed"; Description = "Counts booking items" },
        @{ Pattern = "v_booking_total_cents"; Description = "Calculates booking totals" },
        @{ Pattern = "confirm_booking_reservation"; Description = "Confirms booking reservations" },
        @{ Pattern = "DELETE FROM booking_reservations"; Description = "Clears booking reservations" },
        @{ Pattern = "product_items_count"; Description = "Tracks product count in metadata" },
        @{ Pattern = "booking_items_count"; Description = "Tracks booking count in metadata" }
    )
    
    $allChecksPass = $true
    foreach ($check in $checks) {
        if ($defText -match $check.Pattern) {
            Write-Host "  ✅ $($check.Description)" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $($check.Description)" -ForegroundColor Red
            $allChecksPass = $false
        }
    }
    
    if ($allChecksPass) {
        Write-Host ""
        Write-Host "  🎉 Function successfully updated with booking support!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  ⚠️  Function may not have all required updates" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ❌ Could not retrieve function definition" -ForegroundColor Red
}

# =====================================================================================
# Test 2: Check recent orders with booking items
# =====================================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Test 2: Recent Orders with Bookings" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    $ordersResponse = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/orders?select=id,status,metadata,created_at&order=created_at.desc&limit=10" `
        -Method GET `
        -Headers @{
            "apikey" = $SERVICE_KEY
            "Authorization" = "Bearer $SERVICE_KEY"
        }
    
    $ordersWithBookings = $ordersResponse | Where-Object { 
        $_.metadata -and 
        ($_.metadata | ConvertTo-Json) -match "booking_items_count" 
    }
    
    if ($ordersWithBookings.Count -gt 0) {
        Write-Host "  ✅ Found $($ordersWithBookings.Count) order(s) with booking metadata" -ForegroundColor Green
        
        foreach ($order in $ordersWithBookings | Select-Object -First 3) {
            $meta = $order.metadata
            Write-Host ""
            Write-Host "  Order ID: $($order.id)" -ForegroundColor Gray
            Write-Host "  Status: $($order.status)" -ForegroundColor Gray
            Write-Host "  Created: $($order.created_at)" -ForegroundColor Gray
            
            if ($meta.product_items_count) {
                Write-Host "  Product Items: $($meta.product_items_count)" -ForegroundColor Gray
            }
            if ($meta.booking_items_count) {
                Write-Host "  Booking Items: $($meta.booking_items_count)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  ℹ️  No orders with booking metadata found yet" -ForegroundColor Cyan
        Write-Host "     This is expected if no mixed carts have been checked out since the fix" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ⚠️  Could not check recent orders: $_" -ForegroundColor Yellow
}

# =====================================================================================
# Test 3: Check for confirmed bookings linked to payment intents
# =====================================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Test 3: Confirmed Bookings with Payment Links" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    $bookingsResponse = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/bookings?select=id,status,payment_intent_id,created_at&status=eq.confirmed&order=created_at.desc&limit=10" `
        -Method GET `
        -Headers @{
            "apikey" = $SERVICE_KEY
            "Authorization" = "Bearer $SERVICE_KEY"
        }
    
    $bookingsWithPayment = $bookingsResponse | Where-Object { $_.payment_intent_id }
    
    if ($bookingsWithPayment.Count -gt 0) {
        Write-Host "  ✅ Found $($bookingsWithPayment.Count) confirmed booking(s) linked to payments" -ForegroundColor Green
        
        foreach ($booking in $bookingsWithPayment | Select-Object -First 3) {
            Write-Host ""
            Write-Host "  Booking ID: $($booking.id)" -ForegroundColor Gray
            Write-Host "  Payment Intent: $($booking.payment_intent_id)" -ForegroundColor Gray
            Write-Host "  Created: $($booking.created_at)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ℹ️  No confirmed bookings with payment links found yet" -ForegroundColor Cyan
        Write-Host "     This is expected if no bookings have been checked out since the fix" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ⚠️  Could not check confirmed bookings: $_" -ForegroundColor Yellow
}

# =====================================================================================
# Test 4: Check for orphaned booking reservations
# =====================================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Test 4: Orphaned Booking Reservations Check" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

try {
    $reservationsResponse = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/booking_reservations?select=id,status,customer_user_id,created_at&status=eq.confirmed" `
        -Method GET `
        -Headers @{
            "apikey" = $SERVICE_KEY
            "Authorization" = "Bearer $SERVICE_KEY"
        }
    
    if ($reservationsResponse.Count -gt 0) {
        Write-Host "  ⚠️  Found $($reservationsResponse.Count) confirmed reservation(s) still in table" -ForegroundColor Yellow
        Write-Host "     These should have been deleted after order confirmation" -ForegroundColor Gray
        Write-Host "     This may indicate the cleanup didn't run or there's a timing issue" -ForegroundColor Gray
    } else {
        Write-Host "  ✅ No orphaned confirmed reservations found" -ForegroundColor Green
        Write-Host "     Cleanup is working properly!" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ⚠️  Could not check booking reservations: $_" -ForegroundColor Yellow
}

# =====================================================================================
# Summary
# =====================================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To fully test the fix, perform a test checkout with:" -ForegroundColor Yellow
Write-Host "  1. Add a product to cart" -ForegroundColor Gray
Write-Host "  2. Add a booking reservation to cart" -ForegroundColor Gray
Write-Host "  3. Complete checkout and payment" -ForegroundColor Gray
Write-Host "  4. Verify both product and booking are cleared from cart" -ForegroundColor Gray
Write-Host "  5. Verify booking appears as confirmed in the bookings table" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  - Monitor production orders for booking_items_count in metadata" -ForegroundColor Gray
Write-Host "  - Check that booking_reservations table is properly cleaned" -ForegroundColor Gray
Write-Host "  - Verify customer cart is empty after checkout" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Verification Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
