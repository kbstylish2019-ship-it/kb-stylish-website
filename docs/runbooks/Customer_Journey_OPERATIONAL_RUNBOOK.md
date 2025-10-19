# CUSTOMER JOURNEY - OPERATIONAL RUNBOOK

**Version**: 1.0  
**Last Updated**: October 18, 2025  
**For**: Customer Support & Operations Team

---

## 🎯 QUICK REFERENCE

### Emergency Contacts
- **On-Call Engineer**: [Phone/Pager]
- **Technical Lead**: [Contact]
- **Support Lead**: [Contact]

### System Status
- **Status Page**: https://status.kbstylish.com
- **Monitoring**: Vercel Dashboard / Sentry
- **Database**: Supabase Dashboard

---

## 📋 COMMON CUSTOMER ISSUES

### Issue #1: "I Can't Login"

**Symptoms**: Login button doesn't work, stuck on modal

**Common Causes**:
1. Wrong email/password
2. Account doesn't exist
3. Email not verified (if email verification enabled)

**Resolution Steps**:
```
1. Verify email address is correct
2. Check if account exists in database:
   - Supabase Dashboard → Authentication → Users
   - Search by email
3. If account exists:
   - Ask user to try "Forgot Password"
   - Reset password via Supabase
4. If account doesn't exist:
   - Guide user to register
5. Clear browser cache/cookies
```

**Database Query**:
```sql
SELECT email, created_at, email_confirmed_at 
FROM auth.users 
WHERE email = 'user@example.com';
```

**Escalation**: If user still can't login after password reset → Technical Support

---

### Issue #2: "My Cart Is Empty"

**Symptoms**: Items disappear from cart

**Common Causes**:
1. Guest session expired
2. User logged out
3. Cart cleared by user
4. Product became unavailable

**Resolution Steps**:
```
1. Ask if user logged in/out recently
2. Check if products still available:
   - Go to product page
   - Verify "Add to Cart" button enabled
3. If guest user:
   - Cart only persists in browser
   - Clearing cookies = empty cart
4. If logged in user:
   - Cart should persist
   - Check database for cart items
```

**Database Query**:
```sql
SELECT c.id, ci.product_name, ci.quantity
FROM carts c
JOIN cart_items ci ON ci.cart_id = c.id
WHERE c.user_id = 'user-uuid';
```

**Workaround**: Guide user to re-add items

**Escalation**: If cart items disappearing repeatedly → Bug report to Engineering

---

### Issue #3: "Order Not Found" (Track Order)

**Symptoms**: Track Order page says "Order not found"

**Common Causes**:
1. Typo in order number
2. Order number format wrong
3. Order hasn't been created yet
4. Order from different account

**Resolution Steps**:
```
1. Verify order number format: ORD-YYYYMMDD-XXXXX
2. Check confirmation email for correct number
3. Try with/without dashes
4. Check if order exists:
   - Supabase → orders table
   - Search by email or phone
5. If order exists but not tracking:
   - Verify order.is_active = true
   - Check RLS policies
```

**Database Query**:
```sql
SELECT order_number, status, created_at, shipping_name
FROM orders
WHERE shipping_phone = '1234567890'
OR shipping_name ILIKE '%customer name%'
ORDER BY created_at DESC
LIMIT 5;
```

**Escalation**: If order exists but can't be tracked → Technical Support

---

### Issue #4: "Payment Failed"

**Symptoms**: Checkout fails, payment doesn't process

**Common Causes**:
1. Payment gateway down
2. Insufficient funds
3. Card declined
4. Network timeout

**Resolution Steps**:
```
1. Ask customer to try again
2. Check payment gateway status
3. Verify card details entered correctly
4. Try different payment method
5. If error persists:
   - Check Supabase logs for payment errors
   - Look for payment_intent errors
```

**Database Query**:
```sql
SELECT id, status, error_message, created_at
FROM payment_intents
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC
LIMIT 5;
```

**Escalation**: Payment gateway errors → Engineering immediately

---

### Issue #5: "Product Shows Out of Stock But Available"

**Symptoms**: Product page says out of stock, vendor has inventory

**Common Causes**:
1. Inactive product variant
2. Inventory not synced
3. Cache issue

**Resolution Steps**:
```
1. Check product page directly
2. Verify in database:
   - product_variants.is_active = true
   - inventory.quantity_available > 0
3. Clear cache (Vercel KV)
4. Ask vendor to check inventory
```

**Database Query**:
```sql
SELECT 
  p.name,
  pv.sku,
  pv.is_active as variant_active,
  i.quantity_available
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
LEFT JOIN inventory i ON i.variant_id = pv.id
WHERE p.slug = 'product-slug';
```

**Fix**: Activate variant if inactive:
```sql
UPDATE product_variants 
SET is_active = true 
WHERE id = 'variant-uuid';
```

**Escalation**: If inventory sync broken → Technical Support

---

## 🔧 TROUBLESHOOTING GUIDES

### Authentication Issues

**Problem**: Users can't access protected pages

**Debug Steps**:
1. Check if user logged in: Browser DevTools → Application → Cookies
2. Look for `sb-access-token` cookie
3. Verify token not expired
4. Check RLS policies in Supabase
5. Test with different browser/incognito

**Common Fix**: Ask user to logout and login again

---

### Performance Issues

**Problem**: Site loading slowly

**Check**:
1. Vercel status page
2. Supabase dashboard - database performance
3. Response times in logs
4. Network tab in browser DevTools

**Quick Win**: Clear Vercel KV cache if stale data

---

### Order Status Not Updating

**Problem**: Vendor updated status but customer doesn't see it

**Causes**:
1. Vendor updated item status, not order status
2. Cache not invalidated
3. Customer looking at old page

**Fix**:
1. Explain item vs order status difference
2. Ask customer to refresh page (Ctrl+F5)
3. Verify database has latest status

**Database Query**:
```sql
SELECT 
  o.order_number,
  o.status as order_status,
  oi.product_name,
  oi.fulfillment_status as item_status
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.order_number = 'ORD-20251018-54237';
```

---

## 📞 ESCALATION PROCEDURES

### Level 1: Customer Support (You)
**Handle**: General questions, simple issues, order tracking

### Level 2: Technical Support
**Escalate When**:
- Database issues
- Payment gateway problems
- Authentication bugs
- Data integrity issues

**How**: Email tech-support@kbstylish.com or Slack #tech-support

### Level 3: Engineering
**Escalate When**:
- Site down
- Critical bugs affecting multiple users
- Security concerns
- Data loss

**How**: Page on-call engineer + Email engineering@kbstylish.com

### Level 4: Leadership
**Escalate When**:
- PR crisis
- Legal issues
- Major outage > 1 hour

**How**: Contact CTO/CEO directly

---

## ❓ FREQUENTLY ASKED QUESTIONS

### Q: How do I create an account?
**A**: Click "Login / Register" → "Register" tab → Fill form → Submit. Profile created automatically.

### Q: How do I reset my password?
**A**: Click "Login / Register" → "Forgot Password" → Enter email → Check email for reset link.

### Q: How long does shipping take?
**A**: 2-4 days in Kathmandu, 3-6 days nationwide. Check Track Order for specific delivery updates.

### Q: Can I cancel my order?
**A**: Yes, if order status is "Pending" or "Confirmed". Contact support immediately. Once shipped, cancellation not possible.

### Q: Why can't I add item to cart?
**A**: Product may be out of stock or inactive. Check product page for "Add to Cart" button. If greyed out, item unavailable.

### Q: How do I track my order?
**A**: Go to Track Order page → Enter order number from confirmation email → View status.

### Q: What payment methods accepted?
**A**: [List your payment methods: Credit Card, eSewa, Khalti, COD, etc.]

### Q: Can I change shipping address?
**A**: Only if order not yet shipped. Contact support immediately with new address.

### Q: How do I contact vendor?
**A**: Customer cannot contact vendor directly. Contact our support team and we'll coordinate.

### Q: My order shows wrong price!
**A**: Verify order confirmation email. If price is incorrect, contact support immediately with order number.

---

## 📊 MONITORING CHECKLIST

### Daily Checks:
- [ ] Check error rates in Sentry
- [ ] Review customer support tickets
- [ ] Verify site is accessible
- [ ] Check payment success rate

### Weekly Checks:
- [ ] Review common issues
- [ ] Update FAQ if needed
- [ ] Check database backup status
- [ ] Review escalation metrics

### Monthly Checks:
- [ ] Update runbook with new issues
- [ ] Review and improve response times
- [ ] Train team on new features
- [ ] Audit resolved vs unresolved tickets

---

## 🔐 ACCESS & PERMISSIONS

### What Support Team Can Access:
- ✅ Order information (read-only)
- ✅ Customer contact details
- ✅ Shipping status
- ✅ Product availability

### What Support Team CANNOT Access:
- ❌ User passwords
- ❌ Payment card details
- ❌ Database write access
- ❌ Production code changes

**If you need elevated access**: Request from Technical Lead with business justification.

---

## 📝 TICKET TEMPLATES

### Bug Report Template:
```
Title: [Brief description]
Severity: Critical / High / Medium / Low
Affected Users: [Number or "Single user"]
Steps to Reproduce:
1. 
2. 
3. 
Expected: [What should happen]
Actual: [What actually happens]
Browser/Device: 
Screenshots: [Attach if available]
```

### Feature Request Template:
```
Title: [Feature name]
Requested By: [Customer or internal]
Use Case: [Why is this needed]
Priority: High / Medium / Low
Details: [Full description]
```

---

## 🎯 SUCCESS METRICS

### Support KPIs:
- **First Response Time**: < 2 hours
- **Resolution Time**: < 24 hours (non-critical)
- **Customer Satisfaction**: > 90%
- **Escalation Rate**: < 10%

### Track These:
- Number of tickets per day
- Common issue types
- Resolution without escalation rate
- Customer feedback scores

---

**This runbook is a living document. Update it as you discover new issues!** 📚

**Version Control**: Last updated Oct 18, 2025 | Next review: Nov 18, 2025
