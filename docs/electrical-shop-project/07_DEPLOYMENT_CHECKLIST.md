# 🚀 DEPLOYMENT CHECKLIST
# Production Launch Guide for ElectroPro

**Date**: January 27, 2026  
**Purpose**: Complete checklist for production deployment  
**Status**: COMPLETE

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### ✅ Code Quality
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console.log statements in production code
- [ ] No hardcoded secrets in codebase
- [ ] All TODO comments addressed

### ✅ Testing
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] Manual testing complete on staging
- [ ] Mobile responsiveness verified
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Performance acceptable (Lighthouse score > 80)

### ✅ Security
- [ ] All RLS policies enabled and tested
- [ ] Admin-only routes protected
- [ ] JWT validation working
- [ ] No sensitive data exposed in client
- [ ] CORS configured correctly
- [ ] Rate limiting in place (Edge Functions)

### ✅ Content
- [ ] All placeholder text replaced
- [ ] Legal pages updated (Privacy, Terms)
- [ ] Contact information correct
- [ ] Email templates branded
- [ ] Favicon and meta images updated

---

## 🗄️ DATABASE DEPLOYMENT

### Supabase Production Checklist

#### 1. Project Configuration
```bash
# Verify project settings in Supabase Dashboard

# Settings > General
- Project name: ElectroPro
- Region: ap-south-1 (or closest)
- Compute size: Appropriate for expected load

# Settings > Database
- Connection pooling: Enabled (recommended)
- SSL enforcement: Enabled
```

#### 2. Schema Verification
```sql
-- Run in SQL Editor to verify all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Expected tables:
-- products, product_variants, product_images
-- categories, product_attributes, attribute_values
-- inventory, inventory_locations, inventory_movements
-- orders, order_items, order_status_history
-- carts, cart_items
-- reviews, review_votes, review_replies
-- user_profiles, user_roles
-- shop_settings, support_tickets, support_messages
-- etc.
```

#### 3. RLS Policies Verification
```sql
-- Check RLS is enabled on all tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- All should show rowsecurity = true
```

#### 4. Functions Verification
```sql
-- List all functions
SELECT proname, prosecdef 
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace;

-- Verify critical functions exist:
-- get_cart_details, add_to_cart, remove_from_cart
-- process_order, update_inventory_quantity
-- etc.
```

#### 5. Indexes Verification
```sql
-- Check indexes exist for performance
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

## ⚡ EDGE FUNCTIONS DEPLOYMENT

### Deploy All Functions
```bash
# From project root
cd supabase/functions

# Deploy each function
supabase functions deploy admin-dashboard
supabase functions deploy owner-dashboard
supabase functions deploy cart-manager
supabase functions deploy create-order-intent
supabase functions deploy fulfill-order
supabase functions deploy verify-payment
supabase functions deploy khalti-webhook
supabase functions deploy npx-webhook
supabase functions deploy review-manager
supabase functions deploy vote-manager
supabase functions deploy reply-manager
supabase functions deploy ratings-worker
supabase functions deploy send-email
supabase functions deploy order-worker
supabase functions deploy metrics-worker
supabase functions deploy cache-cleanup-worker
supabase functions deploy cache-invalidator
supabase functions deploy get-curated-content
supabase functions deploy user-onboarding
supabase functions deploy support-ticket-manager
supabase functions deploy review-request-worker

# Verify deployments
supabase functions list
```

### Configure Secrets
```bash
# Set all required secrets
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set KHALTI_SECRET_KEY=live_secret_key_xxxx
supabase secrets set NPX_SECRET_KEY=xxxxxxxxxxxx

# Verify secrets are set
supabase secrets list
```

### Test Functions
```bash
# Test a simple function
curl -X POST https://[PROJECT_ID].supabase.co/functions/v1/cart-manager \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"action": "get_cart"}'

# Should return: {"items": [], "total": 0}
```

---

## 🌐 VERCEL DEPLOYMENT

### 1. Create Vercel Project
```bash
# Option A: Vercel CLI
npm i -g vercel
vercel login
vercel

# Option B: Vercel Dashboard
# Go to https://vercel.com/new
# Import from GitHub repository
```

### 2. Configure Environment Variables
```
# In Vercel Dashboard > Project > Settings > Environment Variables

# Required:
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon_key]
SUPABASE_SERVICE_ROLE_KEY=[service_role_key]

# Optional (if using):
NEXT_PUBLIC_SITE_URL=https://electropro.com
RESEND_API_KEY=[if sending emails from frontend]
```

### 3. Configure Build Settings
```
# Framework Preset: Next.js
# Build Command: npm run build
# Output Directory: .next
# Install Command: npm install
# Node.js Version: 20.x
```

### 4. Configure Domain
```bash
# In Vercel Dashboard > Project > Settings > Domains

# Add domain: electropro.com
# Add domain: www.electropro.com

# Configure DNS at registrar:
# A record: @ -> 76.76.21.21
# CNAME record: www -> cname.vercel-dns.com
```

### 5. Deploy
```bash
# Automatic: Push to main branch
git push origin main

# Manual: Vercel CLI
vercel --prod
```

---

## 💳 PAYMENT GATEWAY CONFIGURATION

### Khalti Production Setup

#### 1. Switch to Production Mode
```bash
# In Khalti Merchant Dashboard
# - Enable Production mode
# - Get production API keys
# - Configure webhook URL

# Webhook URL:
https://[PROJECT_ID].supabase.co/functions/v1/khalti-webhook
```

#### 2. Update Secrets
```bash
# Update to production keys
supabase secrets set KHALTI_SECRET_KEY=live_secret_key_xxxxxxxxxxxx

# Verify
supabase secrets list
```

#### 3. Test Transaction
```bash
# Make a small test purchase
# Verify webhook received
# Check order status updated
```

### NPX Production Setup (If Using)
```bash
# Similar process for NPX
# Update webhook URL
# Update API keys
supabase secrets set NPX_SECRET_KEY=live_xxxxxxxxxxxx
```

---

## 📧 EMAIL CONFIGURATION

### Resend Setup
```bash
# 1. Verify domain in Resend dashboard
# 2. Add DNS records:
#    - DKIM records
#    - SPF record
#    - DMARC record (optional)

# 3. Update sender in code
# FROM: noreply@resend.dev
# TO: noreply@electropro.com

# 4. Update API key if needed
supabase secrets set RESEND_API_KEY=re_live_xxxxxxxxxxxx
```

### Email Templates
- [ ] Welcome email branded
- [ ] Order confirmation branded
- [ ] Shipping notification branded
- [ ] Password reset branded
- [ ] Review request branded

---

## 📊 MONITORING SETUP

### Supabase Monitoring
```bash
# In Supabase Dashboard > Reports

# Enable:
# - Database stats
# - API logs
# - Auth logs
# - Function logs

# Set up alerts:
# - High error rate
# - Database connection issues
# - Function failures
```

### Vercel Analytics
```bash
# In Vercel Dashboard > Analytics

# Enable:
# - Web Vitals
# - Audience insights
# - Real-time logs
```

### Error Tracking (Optional)
```bash
# Consider adding:
# - Sentry for error tracking
# - LogRocket for session replay
```

---

## ✅ POST-DEPLOYMENT VERIFICATION

### Critical Path Testing
```
□ Homepage loads correctly
□ Products display with images
□ Search works
□ Filters work (voltage, brand, etc.)
□ Category navigation works
□ Product detail shows specs
□ Add to cart works
□ Cart shows correct items
□ Checkout form works
□ Payment completes (test mode first)
□ Order confirmation email received
□ Order appears in admin
□ Admin can update order status
□ Inventory decremented on order
□ Low stock alerts work
□ Stock adjustment works
```

### Admin Functions Testing
```
□ Admin can login
□ Dashboard shows correct stats
□ Products can be added
□ Products can be edited
□ Products can be deleted
□ Categories can be managed
□ Orders can be viewed
□ Orders can be fulfilled
□ Inventory can be adjusted
□ Movement history visible
□ Customers can be viewed
□ Support tickets work
```

### Security Verification
```
□ Non-admin cannot access /owner routes
□ Non-admin cannot access /admin routes
□ Cannot add products without auth
□ Cannot adjust inventory without auth
□ RLS prevents data leakage
□ Payment data not logged
```

---

## 🔄 ROLLBACK PLAN

### If Critical Issues Found

#### 1. Revert Vercel Deployment
```bash
# In Vercel Dashboard > Deployments
# Find last working deployment
# Click "..." > "Promote to Production"
```

#### 2. Revert Database (If Needed)
```bash
# If migration caused issues
# Use Supabase point-in-time recovery
# In Dashboard > Database > Backups
# Restore to before problematic migration
```

#### 3. Revert Edge Functions
```bash
# Redeploy previous version
# Or disable problematic function
supabase functions delete [function-name]
```

---

## 📝 LAUNCH DAY CHECKLIST

### T-1 Hour
- [ ] Final production build pushed
- [ ] All environment variables verified
- [ ] DNS propagation complete
- [ ] SSL certificate active

### T-0 Launch
- [ ] Switch payment to production mode
- [ ] Verify site accessible at production URL
- [ ] Complete one test order
- [ ] Verify admin functions working
- [ ] Send launch notification (if applicable)

### T+1 Hour
- [ ] Monitor error logs
- [ ] Check for any 500 errors
- [ ] Verify orders processing correctly
- [ ] Check email delivery

### T+24 Hours
- [ ] Review analytics
- [ ] Address any reported issues
- [ ] Backup database
- [ ] Document any hotfixes needed

---

## 📞 SUPPORT HANDOFF

### Client Documentation
```markdown
# ElectroPro Admin Guide

## Login
- URL: https://electropro.com/auth/login
- Email: owner@electropro.com
- Password: [provided separately]

## Adding Products
1. Go to Dashboard > Products > Add Product
2. Fill in product details
3. Add variants (if applicable)
4. Set inventory quantities
5. Upload images
6. Publish

## Managing Inventory
1. Go to Dashboard > Inventory
2. View stock levels
3. Click "Adjust" to update stock
4. Select reason (Purchase, Adjustment, etc.)
5. Enter quantity change

## Processing Orders
1. Go to Dashboard > Orders
2. View pending orders
3. Click order to view details
4. Update status as needed
5. System auto-updates inventory on sale

## Support
- Technical issues: support@developer.com
- Emergency: +977-XXXXXXXXXX
```

---

## 🏆 SUCCESS CRITERIA

### Launch is Successful When:
1. ✅ Site loads in < 3 seconds
2. ✅ All products display correctly
3. ✅ Checkout completes without errors
4. ✅ Payments process correctly
5. ✅ Emails send correctly
6. ✅ Admin functions work
7. ✅ No critical errors in logs
8. ✅ Client can manage independently

---

**Document Status**: COMPLETE  
**All Planning Documents**: COMPLETE  
**Ready for Implementation**: YES
