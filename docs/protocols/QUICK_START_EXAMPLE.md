# 🚀 QUICK START EXAMPLE
## Your First Certification Campaign in 3 Steps

**Time Required**: 6-12 hours (AI) + 2-4 hours (Human)  
**Campaign**: Customer Journey Certification  
**Goal**: Certify the complete customer experience from landing to post-purchase

---

## 📋 Before You Begin

### Prerequisites Checklist
- [ ] You have access to Claude Sonnet 4.5 or equivalent AI
- [ ] AI has MCP (Supabase) access configured
- [ ] AI has read/write access to the codebase
- [ ] You have access to the live application (staging environment)
- [ ] You have Supabase dashboard access
- [ ] You have 6-12 hours for AI to work
- [ ] You have 2-4 hours for manual testing

### Preparation
1. Read `00_MASTER_CAMPAIGN_ORCHESTRATION.md` (30 min)
2. Skim `01_DOCTRINE_OF_INQUIRY_TEMPLATE.md` (15 min)
3. Skim `02_FORENSIC_RESTORATION_TEMPLATE.md` (15 min)
4. Set aside dedicated time for testing

---

## STEP 1: Generate the Doctrine of Inquiry (AI Work - 4-6 hours)

### Your Prompt to AI

```markdown
You are executing the Doctrine of Inquiry Protocol for KB Stylish platform.

**MISSION PARAMETERS**:
DOMAIN: Customer Journey
SCOPE: Everything a customer experiences from landing on the site to post-purchase activities
SCALE_TARGET: 10,000 concurrent users
CRITICALITY: Revenue-Critical

**SUB-SYSTEMS TO ANALYZE**:
- Authentication (signup, login, password reset, social auth)
- Product Discovery (browse, search, filter, categories)
- Product Details (view product, reviews, vendor info)
- Shopping Cart (add, update, remove, persist across sessions)
- Checkout (address entry, payment, order confirmation)
- Order Tracking (view orders, status updates, cancellation requests)
- Reviews & Ratings (write review, upload photos, helpful votes)
- Customer Profile (edit profile, manage addresses, preferences)

**PRIMARY USER FLOWS TO TRACE** (Minimum 10):
1. First-time visitor → Browse products → View product details → Register → Add to cart → Checkout → Purchase → Receive order → Write review
2. Returning customer → Login → Search for product → Filter results → Add multiple items to cart → Apply discount code → Checkout → Track order
3. Mobile user → Browse on mobile → View product → Add to cart → Guest checkout (no registration)
4. Failed payment scenario → Customer attempts payment → Payment fails → Retries with different method → Success
5. Order cancellation → Customer requests cancellation → Admin approves → Refund processed → Confirmation
6. Cart abandonment → Customer adds items → Leaves site → Returns days later → Cart still populated
7. Review journey → Customer receives product → Writes detailed review → Uploads photos → Review appears on product page
8. Multiple addresses → Customer has home and work address → Selects different address at checkout → Order ships to correct location
9. Wishlist usage → Customer adds products to wishlist → Shares wishlist → Friend purchases from wishlist
10. Customer support → Customer has issue → Submits support ticket → Admin responds → Issue resolved

**PROTOCOL LOCATION**: 
Read and follow: docs/protocols/01_DOCTRINE_OF_INQUIRY_TEMPLATE.md

**EXPECTED OUTPUT**:
Create folder: docs/certification/customer journey/
Create: docs/certification/customer journey/Customer_Journey_DOCTRINE_OF_INQUIRY.md

**EXECUTION COMMAND**:
INITIATE DOCTRINE OF INQUIRY PROTOCOL.

Execute all 5 phases:
- Phase 1: Total System Consciousness (use MCP extensively)
- Phase 2: Generate 500+ questions from 5-expert panel
- Phase 3: Risk stratification (P0-P3 prioritization)
- Phase 4: Test coverage matrix
- Phase 5: Final Doctrine document

Be thorough. Be paranoid. Be relentless. Miss nothing.
```

### What AI Will Do

1. **Phase 1: System Immersion (120-180 min)**
   - Query live database via MCP for all customer-related tables
   - Read all authentication code
   - Trace cart and checkout flows
   - Map Edge Functions handling customer actions
   - Document complete data flows

2. **Phase 2: Question Generation (120-180 min)**
   - Generate 100+ security questions
   - Generate 100+ performance questions
   - Generate 100+ data integrity questions
   - Generate 100+ UX questions
   - Generate 100+ integration questions
   - **Total: 500+ questions**

3. **Phase 3-5: Organization & Output (60 min)**
   - Prioritize all questions (P0 = critical, P1 = high, P2 = medium, P3 = low)
   - Create test coverage matrix
   - Generate final Doctrine of Inquiry document

### Your Review

When AI completes, review `docs/certification/Customer_Journey_DOCTRINE_OF_INQUIRY.md`:

```markdown
Check for:
✅ All 8 sub-systems covered
✅ All 10 user flows traced
✅ 500+ questions generated
✅ Questions are specific and testable
✅ Questions organized by expert and priority
✅ System maps are complete
✅ No major gaps in coverage

If gaps found:
Provide feedback: "The [subsystem] needs more [expert type] questions. Please add 20 more focused on [specific concern]."
```

---

## STEP 2: Execute Forensic Restoration (AI Work - 8-12 hours)

### Your Prompt to AI

```markdown
You are executing the Forensic Restoration Protocol for KB Stylish platform.

**MISSION PARAMETERS**:
INPUT_DOCUMENT: docs/certification/customer journey/Customer_Journey_DOCTRINE_OF_INQUIRY.md
DOMAIN: Customer Journey
PRIORITY_FILTER: P0-P3 (analyze and fix all priorities)

**PROTOCOL LOCATION**:
Read and follow: docs/protocols/02_FORENSIC_RESTORATION_TEMPLATE.md

**YOUR MISSION**:
1. Answer EVERY question in the Doctrine of Inquiry with verifiable evidence
2. Identify ALL flaws, bugs, and inconsistencies
3. Create a Remediation Blueprint for all issues
4. Implement surgical fixes with zero regressions
5. Test every fix thoroughly
6. Generate production certification report

**EXPECTED OUTPUTS**:
Create in docs/certification/customer journey/ folder:
- Customer_Journey_AUDIT_REPORT.md
- Customer_Journey_REMEDIATION_BLUEPRINT.md
- Customer_Journey_PRODUCTION_CERTIFICATION.md
- [Any enhancement or implementation tracking docs]
- All code fixes (database, Edge Functions, frontend)

**EXECUTION ORDER**:
1. Audit P0 questions FIRST (mandatory)
2. Fix all P0 issues BEFORE moving to P1
3. Test each fix immediately
4. Document all evidence

**EXECUTION COMMAND**:
INITIATE FORENSIC RESTORATION PROTOCOL.

Execute all 5 phases:
- Phase 1: Forensic audit (answer all 500+ questions)
- Phase 2: Remediation blueprint (plan all fixes)
- Phase 3: Surgical implementation (execute fixes)
- Phase 4: Verification & evidence collection (prove it works)
- Phase 5: Production documentation (final report)

Be surgical. Be thorough. Test everything. Break nothing.
```

### What AI Will Do

1. **Phase 1: Forensic Audit (180-240 min)**
   - Answer all 500+ questions one by one
   - Collect evidence (code snippets, database queries, screenshots)
   - Mark each question as PASS / FAIL / PARTIAL / N/A
   - Register all issues found

2. **Phase 2: Remediation Blueprint (60-90 min)**
   - Group related issues
   - Create detailed fix plan for each issue
   - Define testing strategy
   - Document rollback plans
   - Get virtual expert panel approval

3. **Phase 3: Implementation (Variable - 4-8 hours)**
   - Fix all P0 issues first
   - Then P1, P2, P3
   - Test each fix immediately
   - Document changes

4. **Phase 4: Verification (60-120 min)**
   - Collect test evidence
   - Run regression tests
   - Verify end-to-end flows
   - Document proof of correctness

5. **Phase 5: Documentation (30-60 min)**
   - Generate production certification report
   - Create human verification guide
   - Document deployment instructions

### Your Review

When AI completes, review the outputs:

```markdown
Check Production Certification Report:
✅ All P0 questions answered
✅ All P0 issues fixed
✅ At least 90% of P1 issues fixed
✅ Test results included
✅ Human Verification Guide is clear
✅ Deployment instructions present

Check Code Changes:
✅ TypeScript compiles
✅ No linting errors
✅ Code follows existing patterns
✅ Comments explain WHY
✅ No console.log left in code

If issues:
Provide feedback: "The [specific issue] still exists. Please investigate and fix."
```

---

## STEP 3: Human Verification (Your Work - 2-4 hours)

### Your Manual Testing Script

Use the **Human Verification Guide** from the Production Certification Report.

**General Testing Protocol**:

```markdown
### Setup
1. Clear all browser data (cookies, localStorage, cache)
2. Open incognito/private browsing window
3. Open DevTools console (watch for errors)
4. Have Supabase dashboard open in another tab
5. Have mobile device ready for responsive testing

### For Each User Flow:

#### Flow 1: First-time Visitor Journey
**Steps**:
1. Navigate to homepage → Expected: Loads in < 3s, no errors
   - ✅ / ❌ [Document result]
   
2. Click "Browse Products" → Expected: Product grid loads, filters visible
   - ✅ / ❌ [Document result]
   
3. Click on a product → Expected: Product details page loads with reviews
   - ✅ / ❌ [Document result]
   
4. Click "Add to Cart" → Expected: Item added, cart count updates, success message
   - ✅ / ❌ [Document result]
   - Check database: Verify cart item created in `cart_items` table
   
5. Click "Checkout" → Expected: Redirected to login/signup
   - ✅ / ❌ [Document result]
   
6. Fill signup form → Expected: Account created, logged in automatically
   - ✅ / ❌ [Document result]
   - Check database: Verify user record in `auth.users`
   
7. Fill shipping address → Expected: Address form validates, saves
   - ✅ / ❌ [Document result]
   
8. Select payment method → Expected: Payment UI loads correctly
   - ✅ / ❌ [Document result]
   
9. Complete payment → Expected: Order confirmed, confirmation email sent
   - ✅ / ❌ [Document result]
   - Check database: Verify order in `orders` table with correct amount
   
10. Click "Track Order" → Expected: Order status shows "Processing"
    - ✅ / ❌ [Document result]

**Overall Flow Verdict**: ✅ PASS / ❌ FAIL / ⚠️ ISSUES FOUND

**Issues Found**:
[Document any bugs, UX issues, errors, or unexpected behavior]

---

#### Flow 2: Returning Customer Journey
[Repeat detailed testing for each flow]

---

#### Mobile Testing
**Test on Actual Mobile Device**:
1. iPhone (Safari) - Test flows 1, 2, 3
2. Android (Chrome) - Test flows 1, 2, 3

**Check**:
- ✅ / ❌ Touch targets big enough (44x44px minimum)
- ✅ / ❌ Text readable without zooming
- ✅ / ❌ Navigation usable
- ✅ / ❌ Forms work with mobile keyboard
- ✅ / ❌ Images load properly

---

#### Accessibility Testing
**Keyboard Navigation**:
- ✅ / ❌ Can complete entire flow with only keyboard (no mouse)
- ✅ / ❌ Tab order is logical
- ✅ / ❌ Focus states visible
- ✅ / ❌ All interactive elements accessible

**Screen Reader** (if available):
- ✅ / ❌ ARIA labels present
- ✅ / ❌ Form labels associated
- ✅ / ❌ Error messages announced

---

#### Performance Testing
**Check DevTools Network Tab**:
- ✅ / ❌ Initial page load < 3 seconds
- ✅ / ❌ Interactions respond < 1 second
- ✅ / ❌ No unnecessary API calls
- ✅ / ❌ Images optimized

---

#### Error Scenario Testing
**Intentionally Break Things**:
1. Submit form with invalid email → Expected: Friendly error message
   - ✅ / ❌ [Document result]
   
2. Refresh during checkout → Expected: Cart persists, no data loss
   - ✅ / ❌ [Document result]
   
3. Go offline mid-action → Expected: Graceful error, retry option
   - ✅ / ❌ [Document result]
   
4. Use extremely long product name → Expected: UI doesn't break
   - ✅ / ❌ [Document result]

---

### Final Verdict

**Test Summary**:
- Total Flows Tested: [X]
- Flows Passed: [X]
- Flows Failed: [X]
- New Issues Found: [X]

**Certification Decision**:
✅ **CERTIFIED** - All flows work perfectly, ready for production
⚠️ **ISSUES FOUND** - Document issues, send to AI for fix iteration
❌ **NOT READY** - Major issues found, needs significant work
```

### Document Your Findings

Create: `docs/certification/Customer_Journey_HUMAN_VERIFICATION_REPORT.md`

Use the template from Step 3 in the Orchestration Guide.

---

## STEP 4: Fix Iteration (If Issues Found)

### If You Found Issues

**Your Prompt to AI**:

```markdown
HUMAN VERIFICATION COMPLETED for Customer Journey.

STATUS: ISSUES FOUND

The following issues were discovered during manual testing:

**ISSUE-001: Cart not persisting on refresh**
- Priority: P0 (Critical)
- Flow: First-time visitor flow, Step 4
- Description: Added item to cart, refreshed page, cart is empty
- Expected: Cart should persist in localStorage and database
- Reproduction: 
  1. Add product to cart
  2. Refresh page
  3. Cart count shows 0
- Screenshot: [link]

**ISSUE-002: Mobile menu doesn't close after navigation**
- Priority: P1 (High)
- Flow: Mobile testing
- Description: Clicked menu item, navigated to page, but menu stays open
- Expected: Menu should close after navigation
- Device: iPhone 13, Safari
- Screenshot: [link]

[List all issues found...]

---

**YOUR TASK**:
1. Analyze root cause of each issue
2. Implement surgical fixes
3. Test thoroughly
4. Update certification report
5. Provide updated Human Verification Guide for re-testing

Execute fixes following Universal AI Excellence Protocol.
```

**AI will**: Fix issues, test, provide updated verification guide

**You will**: Re-test the specific flows that had issues

**Repeat until**: ✅ CERTIFIED

---

## STEP 5: Final Certification & Documentation

### When All Tests Pass

**Your Final Prompt to AI**:

```markdown
HUMAN VERIFICATION COMPLETED for Customer Journey.

STATUS: ✅ ALL TESTS PASSED

All primary user flows work perfectly. No issues found in latest testing round.

**YOUR TASK**:
Generate final production-ready documentation:

1. Update docs/certification/Customer_Journey_PRODUCTION_CERTIFICATION.md
   - Add human approval
   - Add certification date
   - Mark as PRODUCTION READY

2. Create docs/deployments/Customer_Journey_DEPLOYMENT_GUIDE.md
   - Pre-deployment checklist
   - Step-by-step deployment instructions
   - Post-deployment verification
   - Rollback procedure

3. Create docs/runbooks/Customer_Journey_OPERATIONAL_RUNBOOK.md
   - Common customer issues and solutions
   - Troubleshooting guide
   - Support escalation procedures
   - FAQ for customer support team

4. Update campaign status tracker in docs/protocols/README.md
   - Mark Customer Journey as CERTIFIED
```

### Archive & Celebrate

```markdown
✅ Campaign Status: CERTIFIED
✅ Date: [Date]
✅ Issues Fixed: [Count]
✅ Test Coverage: [Percentage]
✅ Human Approval: YES

Next Campaign: Vendor Journey
```

---

# 🏪 CAMPAIGN 2: VENDOR JOURNEY CERTIFICATION

**Time Required**: 6-12 hours (AI) + 2-4 hours (Human)  
**Goal**: Certify the complete vendor experience from onboarding to payout

---

## STEP 1: Generate the Doctrine of Inquiry (AI Work - 4-6 hours)

### Your Prompt to AI

```markdown
You are executing the Doctrine of Inquiry Protocol for KB Stylish platform.

**MISSION PARAMETERS**:
DOMAIN: Vendor Journey
SCOPE: Everything a vendor experiences from onboarding to payout
SCALE_TARGET: 10,000 concurrent users
CRITICALITY: Trust-Critical & Revenue-Critical

**SUB-SYSTEMS TO ANALYZE**:
- Vendor Onboarding (registration, verification, business setup, KYC)
- Product Management (create products, edit, delete, inventory management, variants, bulk upload)
- Order Fulfillment (receive orders, view order details, update status, mark shipped, handle cancellations)
- Vendor Analytics (sales dashboard, revenue tracking, top products, customer insights)
- Vendor Profile (business information, branding, store policies, shipping settings)
- Payout System (view earnings, pending balance, request payout, transaction history, bank account verification)
- Schedule Management (service availability, working hours, override schedules, holiday blocking)
- Customer Communication (respond to inquiries, handle returns/refunds, dispute resolution)
- Review & Rating (view customer reviews, respond to reviews, rating management)

**PRIMARY USER FLOWS TO TRACE** (Minimum 10):
1. New vendor → Register → Submit verification documents → Get approved → Create first product → Receive first order → Fulfill order → Request payout → Receive payment
2. Existing vendor → Login → Upload 50 products via bulk import → Manage inventory → View analytics dashboard
3. Vendor → Receive order notification → View order details → Mark as processing → Update shipping info → Mark as shipped → Track fulfillment
4. Vendor → Check earnings → View pending balance → Request payout → Verify bank details → Receive confirmation → Track payout status
5. Vendor → Set up schedule for services → Block dates for vacation → Override specific time slots → Customer attempts booking during blocked time
6. Vendor → Receive negative review → Read review → Compose professional response → Submit response → Response appears publicly
7. Vendor → Customer requests cancellation → Review cancellation → Approve/deny → Process refund if approved → Update order status
8. Vendor → Edit product with active orders → Update price/description → Verify existing orders unaffected → New orders reflect changes
9. Vendor → Low inventory alert → Update stock quantity → Verify product still available for purchase → Orders stop when out of stock
10. Vendor → View analytics → Export sales report → Analyze top-selling products → Adjust pricing strategy → Track revenue trends

**PROTOCOL LOCATION**: 
Read and follow: docs/protocols/01_DOCTRINE_OF_INQUIRY_TEMPLATE.md

**EXPECTED OUTPUT**:
Create folder: docs/certification/vendor journey/
Create: docs/certification/vendor journey/Vendor_Journey_DOCTRINE_OF_INQUIRY.md

**IMPORTANT - Document Generation Strategy**:
- Create blank document first using write_to_file with EmptyFile=true
- Add content section by section using multi_edit
- Keep each edit under 6000 tokens (50-100 questions max per edit)
- Build incrementally to avoid token limits

**EXECUTION COMMAND**:
INITIATE DOCTRINE OF INQUIRY PROTOCOL.

Execute all 5 phases:
- Phase 1: Total System Consciousness (use MCP extensively for vendor tables, order tables, payout system)
- Phase 2: Generate 600+ questions from 5-expert panel
- Phase 3: Risk stratification (P0-P3 prioritization)
- Phase 4: Test coverage matrix
- Phase 5: Final Doctrine document (use multi_edit!)

Focus heavily on:
- Payout system integrity (money flow MUST be correct)
- Order fulfillment workflow (critical for customer satisfaction)
- Product management scalability (bulk operations)
- Vendor-customer communication security

Be thorough. Be paranoid. Be relentless. Miss nothing.
```

---

## STEP 2: Execute Forensic Restoration (AI Work - 8-12 hours)

### Your Prompt to AI

```markdown
You are executing the Forensic Restoration Protocol for KB Stylish platform.

**MISSION PARAMETERS**:
INPUT_DOCUMENT: docs/certification/vendor journey/Vendor_Journey_DOCTRINE_OF_INQUIRY.md
DOMAIN: Vendor Journey
PRIORITY_FILTER: P0-P3 (analyze and fix all priorities)

**PROTOCOL LOCATION**:
Read and follow: docs/protocols/02_FORENSIC_RESTORATION_TEMPLATE.md

**YOUR MISSION**:
1. Answer EVERY question in the Doctrine of Inquiry with verifiable evidence
2. Identify ALL flaws, bugs, and inconsistencies
3. Create a Remediation Blueprint for all issues
4. Implement surgical fixes with zero regressions
5. Test every fix thoroughly (especially payout calculations!)
6. Generate production certification report

**EXPECTED OUTPUTS**:
Create in docs/certification/vendor journey/ folder using multi_edit:
- Vendor_Journey_AUDIT_REPORT.md
- Vendor_Journey_REMEDIATION_BLUEPRINT.md
- Vendor_Journey_PRODUCTION_CERTIFICATION.md
- [Any enhancement or implementation tracking docs]
- All code fixes (database, Edge Functions, frontend)

**CRITICAL AREAS - EXTRA SCRUTINY**:
- Payout calculations (verify amounts match orders exactly)
- Order status transitions (no orphaned states)
- Inventory updates (atomic operations, no race conditions)
- Vendor permissions (can only access own data)
- Commission calculations (platform vs vendor split correct)

**EXECUTION ORDER**:
1. Audit P0 questions FIRST (mandatory)
2. Fix all P0 issues BEFORE moving to P1
3. Test each fix immediately
4. Document all evidence
5. Use multi_edit for long documents

**EXECUTION COMMAND**:
INITIATE FORENSIC RESTORATION PROTOCOL.

Be surgical. Be thorough. Test everything. Break nothing.
```

---

# 💇 CAMPAIGN 3: STYLIST JOURNEY CERTIFICATION

**Time Required**: 5-10 hours (AI) + 2-3 hours (Human)  
**Goal**: Certify the complete stylist experience from onboarding to service delivery

---

## STEP 1: Generate the Doctrine of Inquiry (AI Work - 3-5 hours)

### Your Prompt to AI

```markdown
You are executing the Doctrine of Inquiry Protocol for KB Stylish platform.

**MISSION PARAMETERS**:
DOMAIN: Stylist Journey
SCOPE: Everything related to stylist services, bookings, and appointments
SCALE_TARGET: 10,000 concurrent users
CRITICALITY: Service-Critical & Trust-Critical

**SUB-SYSTEMS TO ANALYZE**:
- Stylist Onboarding (registration, profile creation, service setup, portfolio upload, verification)
- Service Management (create services, set pricing, define duration, add descriptions, upload photos)
- Schedule Management (set weekly availability, override specific dates, block time slots, set holidays)
- Booking System (receive booking requests, auto-accept vs manual, confirm bookings, view upcoming appointments)
- Appointment Management (view calendar, mark appointments complete, handle no-shows, reschedule requests)
- Booking Analytics (revenue from bookings, popular services, customer retention, booking history)
- Customer Interaction (booking notes, pre-appointment communication, special requests, follow-up)
- Stylist Earnings (view booking earnings, payout requests, transaction history, commission structure)
- Availability Management (real-time slot availability, buffer times, same-day booking policies)

**PRIMARY USER FLOWS TO TRACE** (Minimum 10):
1. New stylist → Register → Create profile → Add services with pricing → Set weekly schedule → Get first booking → Confirm → Provide service → Mark complete → Get paid
2. Customer → Browse stylists → View stylist profile → See available services → Check calendar → Select date/time → Book appointment → Receive confirmation
3. Stylist → Receive booking request → View customer details → Check calendar → Confirm booking → Send confirmation to customer
4. Stylist → Need time off → Open schedule manager → Block dates (e.g., vacation) → Customer attempts to book during blocked period → No slots shown
5. Stylist → Override single day hours → Set custom hours for specific date → Customer books during custom hours → Booking confirmed
6. Customer → Need to reschedule → Request new time → Stylist receives request → Approves new time → Both parties notified → Calendar updated
7. Stylist → Manage multiple bookings same day → Check calendar → Ensure no overlaps → Buffer time respected between appointments → All bookings feasible
8. Stylist → Complete appointment → Mark as complete → Earnings updated → View in transaction history → Request payout when threshold met
9. Stylist → Edit service details → Change price/duration → Verify existing bookings unaffected → New bookings use updated info
10. Customer → Book service → Stylist doesn't confirm within 24h → Auto-cancellation → Customer notified → Refund processed → Slot becomes available again

**PROTOCOL LOCATION**: 
Read and follow: docs/protocols/01_DOCTRINE_OF_INQUIRY_TEMPLATE.md

**EXPECTED OUTPUT**:
Create folder: docs/certification/stylist journey/
Create: docs/certification/stylist journey/Stylist_Journey_DOCTRINE_OF_INQUIRY.md

**IMPORTANT - Document Generation Strategy**:
- Create blank document first using write_to_file with EmptyFile=true
- Add content section by section using multi_edit
- Keep each edit under 6000 tokens (50-100 questions max per edit)
- Build incrementally to avoid token limits

**EXECUTION COMMAND**:
INITIATE DOCTRINE OF INQUIRY PROTOCOL.

Execute all 5 phases:
- Phase 1: Total System Consciousness (use MCP for bookings table, schedules, availability logic)
- Phase 2: Generate 500+ questions from 5-expert panel
- Phase 3: Risk stratification (P0-P3 prioritization)
- Phase 4: Test coverage matrix
- Phase 5: Final Doctrine document (use multi_edit!)

Focus heavily on:
- Schedule conflicts (no double-booking possible)
- Availability accuracy (displayed slots must be actually available)
- Booking confirmation flow (clear communication)
- Time zone handling (if applicable)
- No-show handling (fair policies for both parties)

Be thorough. Be paranoid. Be relentless. Miss nothing.
```

---

## STEP 2: Execute Forensic Restoration (AI Work - 6-10 hours)

### Your Prompt to AI

```markdown
You are executing the Forensic Restoration Protocol for KB Stylish platform.

**MISSION PARAMETERS**:
INPUT_DOCUMENT: docs/certification/stylist journey/Stylist_Journey_DOCTRINE_OF_INQUIRY.md
DOMAIN: Stylist Journey
PRIORITY_FILTER: P0-P3 (analyze and fix all priorities)

**PROTOCOL LOCATION**:
Read and follow: docs/protocols/02_FORENSIC_RESTORATION_TEMPLATE.md

**YOUR MISSION**:
1. Answer EVERY question in the Doctrine of Inquiry with verifiable evidence
2. Identify ALL flaws, bugs, and inconsistencies
3. Create a Remediation Blueprint for all issues
4. Implement surgical fixes with zero regressions
5. Test every fix thoroughly (especially booking conflicts!)
6. Generate production certification report

**EXPECTED OUTPUTS**:
Create in docs/certification/stylist journey/ folder using multi_edit:
- Stylist_Journey_AUDIT_REPORT.md
- Stylist_Journey_REMEDIATION_BLUEPRINT.md
- Stylist_Journey_PRODUCTION_CERTIFICATION.md
- [Any enhancement or implementation tracking docs]
- All code fixes (database, Edge Functions, frontend)

**CRITICAL AREAS - EXTRA SCRUTINY**:
- Booking conflict prevention (two customers can't book same slot)
- Schedule override logic (custom dates vs weekly schedule)
- Availability calculation (buffer times, blocked periods)
- Booking confirmation workflow (both parties notified)
- Earnings calculation (per service, accurate amounts)

**EXECUTION ORDER**:
1. Audit P0 questions FIRST (mandatory)
2. Fix all P0 issues BEFORE moving to P1
3. Test each fix immediately
4. Document all evidence
5. Use multi_edit for long documents

**EXECUTION COMMAND**:
INITIATE FORENSIC RESTORATION PROTOCOL.

Be surgical. Be thorough. Test everything. Break nothing.
```

---

# 👔 CAMPAIGN 4: ADMIN JOURNEY CERTIFICATION

**Time Required**: 8-14 hours (AI) + 3-5 hours (Human)  
**Goal**: Certify the complete admin experience for platform management

---

## STEP 1: Generate the Doctrine of Inquiry (AI Work - 5-7 hours)

### Your Prompt to AI

```markdown
You are executing the Doctrine of Inquiry Protocol for KB Stylish platform.

**MISSION PARAMETERS**:
DOMAIN: Admin Journey
SCOPE: Everything an admin needs to manage the entire platform
SCALE_TARGET: 10,000 concurrent users
CRITICALITY: Platform-Critical & Governance-Critical

**SUB-SYSTEMS TO ANALYZE**:
- Admin Dashboard (platform overview, key metrics, real-time stats, alerts, activity feed)
- User Management (view all users, filter by role, ban/unban users, reset passwords, role assignment)
- Vendor Management (approve/reject new vendors, verify documents, suspend vendors, vendor performance metrics)
- Product Moderation (review new products, approve/reject, flag inappropriate content, category management)
- Order Management (view all orders, filter/search, resolve disputes, process refunds, manual order creation)
- Platform Analytics (Governance Engine integration, revenue metrics, growth KPIs, user acquisition, export reports)
- Audit Logs (view all system events, filter by user/action/date, security logs, data change history)
- Service Management (create admin-managed services, scheduling, availability, special offerings)
- Payout Approval (review payout requests, verify bank details, approve/reject, process payouts, transaction reconciliation)
- System Configuration (platform settings, feature flags, commission rates, payment gateway config, email templates)
- Customer Support (view support tickets, respond to users, escalate issues, track resolution)
- Content Management (manage banners, promotions, announcements, terms of service, privacy policy)

**PRIMARY USER FLOWS TO TRACE** (Minimum 10):
1. Admin → Login → View dashboard → See critical alert (e.g., failed payouts) → Investigate → Identify issue → Resolve → Verify fix
2. Admin → Review new vendor application → Check submitted documents → Verify business details → Approve/reject with reason → Vendor notified
3. Admin → Product moderation queue → Review flagged product → Check content/images → Approve/reject/request changes → Vendor notified
4. Admin → Customer complaint received → View order details → Review communication history → Issue full refund → Log resolution → Close ticket
5. Admin → Generate monthly platform analytics → Export revenue report → Analyze vendor performance → Identify trends → Share with stakeholders
6. Admin → Review audit logs → Filter by suspicious activity → Identify potential security issue → Take action → Document incident
7. Admin → Review payout requests → Verify order completion → Check bank details → Approve multiple payouts → Process batch payment → Update payout status
8. Admin → User reported inappropriate behavior → Review user activity → Check order history → Issue warning/ban → Document decision → Notify user
9. Admin → Configure platform settings → Update commission rate → Test with sample order → Verify calculations correct → Deploy change → Monitor impact
10. Admin → Emergency: Payment gateway down → Enable maintenance mode → Communicate to users → Switch to backup gateway → Test → Resume operations → Post-mortem

**PROTOCOL LOCATION**: 
Read and follow: docs/protocols/01_DOCTRINE_OF_INQUIRY_TEMPLATE.md

**EXPECTED OUTPUT**:
Create folder: docs/certification/admin journey/
Create: docs/certification/admin journey/Admin_Journey_DOCTRINE_OF_INQUIRY.md

**IMPORTANT - Document Generation Strategy**:
- Create blank document first using write_to_file with EmptyFile=true
- Add content section by section using multi_edit
- Keep each edit under 6000 tokens (50-100 questions max per edit)
- Build incrementally to avoid token limits

**EXECUTION COMMAND**:
INITIATE DOCTRINE OF INQUIRY PROTOCOL.

Execute all 5 phases:
- Phase 1: Total System Consciousness (use MCP for all tables - admin has access to everything)
- Phase 2: Generate 550+ questions from 5-expert panel
- Phase 3: Risk stratification (P0-P3 prioritization)
- Phase 4: Test coverage matrix
- Phase 5: Final Doctrine document (use multi_edit!)

Focus heavily on:
- Admin permission security (proper role enforcement)
- Audit log completeness (all critical actions logged)
- Platform analytics accuracy (Governance Engine integration)
- Payout approval workflow (financial integrity)
- System configuration safety (changes don't break platform)
- Emergency response capabilities (incident handling)

Be thorough. Be paranoid. Be relentless. Miss nothing.
```

---

## STEP 2: Execute Forensic Restoration (AI Work - 10-14 hours)

### Your Prompt to AI

```markdown
You are executing the Forensic Restoration Protocol for KB Stylish platform.

**MISSION PARAMETERS**:
INPUT_DOCUMENT: docs/certification/admin journey/Admin_Journey_DOCTRINE_OF_INQUIRY.md
DOMAIN: Admin Journey
PRIORITY_FILTER: P0-P3 (analyze and fix all priorities)

**PROTOCOL LOCATION**:
Read and follow: docs/protocols/02_FORENSIC_RESTORATION_TEMPLATE.md

**YOUR MISSION**:
1. Answer EVERY question in the Doctrine of Inquiry with verifiable evidence
2. Identify ALL flaws, bugs, and inconsistencies
3. Create a Remediation Blueprint for all issues
4. Implement surgical fixes with zero regressions
5. Test every fix thoroughly (especially admin permissions!)
6. Generate production certification report

**EXPECTED OUTPUTS**:
Create in docs/certification/admin journey/ folder using multi_edit:
- Admin_Journey_AUDIT_REPORT.md
- Admin_Journey_REMEDIATION_BLUEPRINT.md
- Admin_Journey_PRODUCTION_CERTIFICATION.md
- [Any enhancement or implementation tracking docs]
- All code fixes (database, Edge Functions, frontend)

**CRITICAL AREAS - EXTRA SCRUTINY**:
- Admin authentication (MFA, session timeout, role verification)
- Permission enforcement (admins can access everything, but verify RLS still works)
- Audit log integrity (all critical actions logged, tamper-proof)
- Payout approval safety (financial controls, approval workflow)
- System configuration impact (changes tested in staging first)
- Emergency procedures (maintenance mode, rollback capabilities)
- Governance Engine integration (metrics accurate, real-time updates)

**EXECUTION ORDER**:
1. Audit P0 questions FIRST (mandatory)
2. Fix all P0 issues BEFORE moving to P1
3. Test each fix immediately
4. Document all evidence
5. Use multi_edit for long documents

**EXECUTION COMMAND**:
INITIATE FORENSIC RESTORATION PROTOCOL.

Be surgical. Be thorough. Test everything. Break nothing.
```

---

## 🎯 Expected Results

### What You'll Have After This Example

**Documentation**:
- ✅ Comprehensive Doctrine of Inquiry (500+ questions)
- ✅ Complete Audit Report (all questions answered)
- ✅ Remediation Blueprint (all fixes documented)
- ✅ Production Certification Report
- ✅ Human Verification Report
- ✅ Deployment Guide
- ✅ Operational Runbook

**Code Quality**:
- ✅ Zero P0 critical bugs in Customer Journey
- ✅ < 5 P1 issues (all documented with workarounds)
- ✅ All primary user flows tested and working
- ✅ Accessible (WCAG 2.1 AA)
- ✅ Performant (< 3s page loads)
- ✅ Mobile responsive
- ✅ Enterprise-grade error handling

**Confidence**:
- ✅ You can deploy Customer Journey to production with confidence
- ✅ You have forensic evidence of quality
- ✅ You have playbook for remaining campaigns
- ✅ You've proven the protocol works

---

## 🚨 Common Pitfalls to Avoid

### Pitfall 1: Skipping MCP Verification
**Wrong**: AI reads migration files and assumes database state  
**Right**: AI queries live database via MCP for every claim

### Pitfall 2: Rushing Human Testing
**Wrong**: Click through flows quickly, mark as passed  
**Right**: Follow each step carefully, check database, try to break things

### Pitfall 3: Accepting "Partial" Fixes
**Wrong**: "This mostly works, let's move on"  
**Right**: "Fix it completely or document as known limitation"

### Pitfall 4: Ignoring UX Issues
**Wrong**: "It works technically, ship it"  
**Right**: "If UX is confusing, it's a bug"

### Pitfall 5: Not Documenting Evidence
**Wrong**: "I tested it, trust me"  
**Right**: Screenshots, database queries, step-by-step reproduction

---

## 📊 Time Breakdown

**Realistic Timeline for First Campaign**:
- Day 1: AI Doctrine of Inquiry (4-6 hours AI work)
- Day 2: Review Doctrine, provide feedback (1 hour human)
- Day 3-4: AI Forensic Restoration (8-12 hours AI work)
- Day 5: Human verification testing (2-4 hours human)
- Day 6: AI bug fixes (2-4 hours AI work)
- Day 7: Human re-testing (1-2 hours human)
- Day 8: Final documentation (1 hour AI work)

**Total**: 7-8 days (but AI can work overnight/in background)

**Subsequent campaigns**: Faster as AI learns patterns (5-6 days each)

---

## 🎉 Success!

**If you followed this example**, you now have:
1. A certified Customer Journey ready for production
2. Complete documentation trail
3. Proof of quality through forensic evidence
4. Confidence to execute remaining campaigns

**Next steps**:
1. Start Vendor Journey certification
2. Then Stylist Journey
3. Then Admin Journey
4. Then deploy to production with confidence

---

**You've just executed a world-class certification protocol. Your platform is now enterprise-grade.**

🎯 **Ship with Confidence. Your Users Will Thank You.** 🎯
