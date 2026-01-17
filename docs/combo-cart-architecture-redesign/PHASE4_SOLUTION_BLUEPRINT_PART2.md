# PHASE 4: SOLUTION BLUEPRINT - PART 2

**Continuation of Phase 4 Blueprint**

---

## DEPLOYMENT PLAN

### Phase A: Price Fix (IMMEDIATE)

**Steps**:
1. Review migration SQL
2. Test on local database
3. Backup production cart_items
4. Apply migration to production
5. Verify prices corrected
6. Monitor for errors

**Rollback**: Restore from backup if issues

**Time**: 1-2 hours

### Phase B: Combo Grouping UI (NEXT DAY)

**Steps**:
1. Create ComboGroup component
2. Add grouping logic to store
3. Update ProductList component
4. Test locally
5. Deploy frontend
6. Verify grouping works
7. Monitor user feedback

**Rollback**: Revert frontend deployment

**Time**: 4-6 hours

### Phase C: Combo Quantity Controls (DAY 3)

**Steps**:
1. Apply migration (add function)
2. Update edge function
3. Update API client
4. Update store
5. Update ComboGroup component
6. Test end-to-end
7. Deploy all layers
8. Verify functionality
9. Monitor errors

**Rollback**: Disable quantity controls in UI

**Time**: 6-8 hours

---

## SUCCESS CRITERIA

### Phase A Success
- ✅ Test product shows Rs. 0.50 (not Rs. 50)
- ✅ Lilium shows Rs. 499.83 (not Rs. 49,983)
- ✅ Cart total shows Rs. 1,500 (not Rs. 301,198)
- ✅ No errors in logs
- ✅ All existing carts recalculated

### Phase B Success
- ✅ Combos visually grouped with border
- ✅ Combo name and icon displayed
- ✅ Constituent items indented
- ✅ Savings displayed
- ✅ Mobile responsive
- ✅ No React errors

### Phase C Success
- ✅ Quantity controls work
- ✅ All items update proportionally
- ✅ Inventory checks pass
- ✅ Error messages clear
- ✅ Loading states shown
- ✅ No race conditions

---

**STATUS**: ✅ PHASE 4 COMPLETE - READY FOR BLUEPRINT REVIEW

