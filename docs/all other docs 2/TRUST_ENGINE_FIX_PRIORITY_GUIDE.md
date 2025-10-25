# 🚨 TRUST ENGINE - CRITICAL FIXES IMPLEMENTATION GUIDE

## 🎯 IMMEDIATE ACTIONS REQUIRED (P0 - Today)

### FIX #1: Product Rating Worker (30 min)
**Problem**: Ratings never update after reviews  
**Impact**: Products stuck at 0 stars

**Deploy Worker**:
```bash
# Create supabase/functions/ratings-worker/index.ts
# Deploy: supabase functions deploy ratings-worker
# Setup cron: Every 2 minutes
```

Worker processes `update_product_rating` jobs from queue.

---

### FIX #2: Show Vendor Replies (30 min)
**Problem**: Replies exist but customers never see them  
**Impact**: Vendors waste time replying

**Fix in `review-manager/index.ts`**:
```typescript
// Add batch fetch for replies (line ~140):
const { data: replies } = await serviceClient
  .from('review_replies')
  .select('id, review_id, comment, created_at, user:user_profiles(display_name)')
  .in('review_id', reviewIds)
  .eq('reply_type', 'vendor')
  .eq('is_visible', true);

// Map to reviews: vendor_reply: replyMap.get(review.id)
```

**Deploy**: `supabase functions deploy review-manager`

---

### FIX #3: User Vote State (30 min)
**Problem**: Users can't see their own votes after refresh

**Already fixed in Fix #2** - Batch fetch user votes:
```typescript
if (authenticatedUser) {
  const { data: userVotes } = await serviceClient
    .from('review_votes')
    .select('review_id, vote_type')
    .eq('user_id', authenticatedUser.id)
    .in('review_id', reviewIds);
}
```

**Frontend Update**: Add visual indicator in `ReviewCard.tsx`

---

## 🟡 HIGH PRIORITY (P1 - This Week)

### FIX #4: Vendor Dashboard Integration (4 hours)

**Create Files**:
1. `src/app/api/vendor/reviews/route.ts` - API endpoint
2. `src/components/vendor/VendorReviewsManager.tsx` - Dashboard UI
3. Add tab to `src/app/vendor/products/page.tsx`

**Key Features**:
- List all reviews on vendor's products
- Filter: Pending Reply / Replied / All
- Inline reply form
- Real-time count badges

---

### FIX #5: Moderation Worker (3 hours)

**Problem**: Reviews stuck in pending forever

**Create Worker** (`moderation-worker`):
```typescript
// Auto-approve if:
// - User reputation > 80
// - No flagged words detected
// - Account age > 30 days

// Otherwise: Queue for admin review
```

**Deploy**: `supabase functions deploy moderation-worker`  
**Cron**: Every 5 minutes

---

## 🟢 MEDIUM PRIORITY (P2 - Next Week)

### FIX #6: Data Reconciliation Job
- Sync denormalized counts with source of truth
- Run nightly via cron
- Alert on drift > 5%

### FIX #7: Vendor Notifications
- Notify on new review (email + realtime)
- Dashboard badge for unread reviews
- Weekly digest email

### FIX #8: Vote UX Improvement
- Clear visual state for voted/not voted
- Align with industry standards (no toggle)
- Add "Remove vote" explicit option

---

## 📊 VERIFICATION CHECKLIST

After P0 fixes:
- [ ] Submit review → Product rating updates within 2 min
- [ ] Vendor reply → Customers see it immediately
- [ ] Vote on review → State persists after refresh
- [ ] Check job_queue → No stuck jobs
- [ ] View product → Reviews load in < 200ms

After P1 fixes:
- [ ] Vendor logs in → Sees reviews dashboard
- [ ] Vendor replies → UI smooth and intuitive
- [ ] New review → Auto-approved or in queue < 5 min

---

## 🚀 DEPLOYMENT SEQUENCE

**Phase 1** (1 hour):
1. Deploy ratings-worker
2. Setup cron job
3. Verify existing jobs process

**Phase 2** (1 hour):
1. Update review-manager with replies + votes
2. Deploy Edge Function
3. Test on product page

**Phase 3** (4 hours):
1. Build vendor dashboard
2. Test vendor reply flow
3. Deploy to production

**Total**: 6 hours for P0+P1 fixes

---

## 🎯 SUCCESS METRICS

**Before Fixes**:
- 286 reviews, but ratings stuck
- 5 vendor replies invisible
- Users confused about vote state
- Vendors blind to reviews

**After Fixes**:
- ✅ Ratings update automatically
- ✅ All replies visible
- ✅ Vote state persistent
- ✅ Vendors can manage reviews
- ✅ Auto-moderation working

---

**Next**: Proceed with implementation following this priority order.
**Estimated completion**: 1-2 days for full enterprise-grade Trust Engine.
