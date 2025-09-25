# Simple test to see actual test results
& d:\kb-stylish\scripts\verify_cart_security.ps1 | Out-Null

# Get the results variable from the script
$scriptContent = Get-Content d:\kb-stylish\scripts\verify_cart_security.ps1 -Raw
$scriptBlock = [scriptblock]::Create($scriptContent)
& $scriptBlock | Out-Null

Write-Host ""
Write-Host "=== TEST RESULTS ANALYSIS ==="
Write-Host "Total tests: $($results.Count)"
Write-Host ""

$passCount = 0
$failCount = 0

foreach ($result in $results) {
    $status = if ($result.pass) { 
        $passCount++
        "[PASS]" 
    } else { 
        $failCount++
        "[FAIL]" 
    }
    Write-Host "$status $($result.test)"
}

Write-Host ""
Write-Host "Summary: $passCount PASS, $failCount FAIL"

if ($failCount -eq 0) {
    Write-Host "✅ ALL TESTS PASSING - SYSTEM IS PRODUCTION READY"
} else {
    Write-Host "❌ $failCount tests still failing"
}
