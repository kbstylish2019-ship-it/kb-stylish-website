# Testing Guide: Phase D - Duplicate Combo Fix

**Purpose**: Verify that adding the same combo multiple times merges into one group

---

## 🧪 TEST SCENARIOS

### Test 1: Add Same Combo Twice ⭐ PRIMARY TEST

**Steps**:
1. Clear your cart (if not empty)
2. Go to combo detail page (e.g., "Test combo package")
3. Click "Add Bundle to Cart"
4. Wait for success message
5. Go back to the same combo detail page
6. Click "Add Bundle to Cart" again

**Expected Result**:
- ✅ Only ONE combo group visible in cart
- ✅ Quantity shows "2" (not two separate groups with "1" each)
- ✅ All items doubled (e.g., if combo has 1× Item A, now shows 2× Item A)
- ✅ Total price doubled correctly

**How to Verify**:
- Open cart/checkout page
- Count combo groups (should be 1, not 2)
- Check quantity control (should show 2)
- Verify item quantities are doubled

---

### Test 2: Increment Then Add

**Steps**:
1. Clear cart
2. Add combo to cart (quantity = 1)
3. In cart, click "+" to increment (quantity = 2)
4. Go back to combo page
5. Click "Add Bundle to Cart" again

**Expected Result**:
- ✅ Still ONE combo group
- ✅ Quantity now shows "3"
- ✅ All items tripled
- ✅ No duplicate groups

---

### Test 3: Add Different Combos

**Steps**:
1. Clear cart
2. Add Combo A to cart
3. Add Combo B to cart (different combo)

**Expected Result**:
- ✅ TWO separate combo groups (one for each combo)
- ✅ Each shows quantity "1"
- ✅ Independent controls for each

---

### Test 4: Decrement Then Add

**Steps**:
1. Clear cart
2. Add combo twice (quantity = 2)
3. In cart, click "-" to decrement (quantity = 1)
4. Go back to combo page
5. Click "Add Bundle to Cart"

**Expected Result**:
- ✅ Quantity increases to "2"
- ✅ Still one combo group
- ✅ Items doubled again

---

### Test 5: Remove Then Add

**Steps**:
1. Add combo to cart
2. Click "Remove" to remove entire combo
3. Go back to combo page
4. Click "Add Bundle to Cart"

**Expected Result**:
- ✅ NEW combo group created (fresh start)
- ✅ Quantity = 1
- ✅ No reference to old removed combo

---

## 🔍 WHAT TO LOOK FOR

### ✅ Success Indicators
- Only one combo group per combo type
- Quantity increments correctly
- No duplicate groups with same items
- Clean cart display
- Predictable behavior

### ❌ Failure Indicators
- Multiple groups for same combo
- Quantity stuck at 1
- Incrementing one affects another
- Cart shows duplicates

---

## 🐛 KNOWN ISSUES (None Expected)

If you encounter any issues, please report:
1. Screenshot of cart
2. Steps to reproduce
3. Browser console errors
4. Expected vs actual behavior

---

## 📊 VERIFICATION CHECKLIST

After testing, verify:
- [ ] Adding same combo twice creates ONE group with quantity 2
- [ ] Incrementing works correctly
- [ ] Decrementing works correctly
- [ ] Different combos create separate groups
- [ ] Remove and re-add creates fresh group
- [ ] No console errors
- [ ] Prices calculate correctly
- [ ] UI updates smoothly

---

**STATUS**: Ready for testing

**Next Steps**: Test all scenarios and report results
