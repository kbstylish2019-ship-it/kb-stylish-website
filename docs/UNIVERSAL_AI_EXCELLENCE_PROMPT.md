# 🚀 UNIVERSAL AI EXCELLENCE PROTOCOL
# KB STYLISH - ENTERPRISE-GRADE DEVELOPMENT FRAMEWORK

**Version**: 2.0  
**Last Updated**: October 12, 2025  
**Purpose**: Ensure FAANG-level code quality for ANY task in the codebase

---

## ⚠️ CRITICAL DIRECTIVE

**READ THIS FIRST - MANDATORY FOR ALL AI ASSISTANTS**

This prompt MUST be followed for:
- 🐛 Bug fixes
- ✨ New features  
- 🏗️ Architecture changes
- 📊 Investigations
- 🔧 Refactoring
- 📚 Documentation
- 🧪 Testing

**DO NOT WRITE CODE IMMEDIATELY.**

You are required to complete ALL phases below BEFORE implementing ANY changes.

---

## 📋 THE 10-PHASE EXCELLENCE PROTOCOL

### PHASE 1: CODEBASE IMMERSION (Mandatory - 30-60 min)

**Goal**: Build complete mental model of KB Stylish architecture

#### 1.1 Read Architecture Documents
```
REQUIRED READING (in order):
1. docs/GOVERNANCE_ENGINE_PRODUCTION_READINESS_REPORT.md
2. docs/ARCHITECTURE OF GOVERNANCE ENGINE.MD
3. docs/README.md or docs/ARCHITECTURE.md (if exists)
4. docs/*_FORENSIC_AUDIT.md (if related to task)
5. Any task-specific documentation
```

#### 1.2 Understand Core Systems
```
MAP THESE SYSTEMS:
- Authentication: JWT flow, role-based access (admin/vendor/customer)
- Database: Supabase/PostgreSQL schema, RLS policies
- Edge Functions: Which exist, their purpose, version history
- Frontend: Next.js structure, server vs client components
- State Management: Zustand stores, localStorage patterns
- API Layer: apiClient.ts patterns, caching strategies
```

#### 1.3 Identify Existing Patterns
```
DOCUMENT:
- Naming conventions (files, functions, variables)
- Error handling patterns
- Security patterns (SECURITY INVOKER/DEFINER, RLS)
- Testing patterns (E2E, unit, integration)
- Database migration patterns
- Edge Function deployment patterns
```

#### 1.4 Check for Related Code
```sql
-- Search codebase for similar implementations
grep -r "similar_feature_name" src/
grep -r "related_function" supabase/
```

**OUTPUT**: Architecture map document showing data flow, dependencies, patterns

---

### PHASE 2: THE 5-EXPERT PANEL CONSULTATION

Before proposing solutions, consult these 5 virtual experts:

#### 👨‍💻 Expert 1: Senior Security Architect
**Expertise**: Authentication, authorization, data protection, attack vectors

**Questions to Ask**:
1. What are the security implications of this change?
2. Does this violate least-privilege principle?
3. Can this be exploited (SQL injection, XSS, CSRF, etc.)?
4. Are we exposing sensitive data?
5. Is RLS properly enforced?
6. Do we need audit logging?
7. Are JWTs properly validated?
8. Is rate limiting needed?

**Must Review**:
- Database functions (SECURITY INVOKER vs DEFINER)
- Edge Function authentication
- RLS policies
- Input validation
- Output sanitization

---

#### ⚡ Expert 2: Performance Engineer
**Expertise**: Scalability, latency, database optimization, caching

**Questions to Ask**:
1. Will this scale to 10M+ rows?
2. What's the query plan (EXPLAIN ANALYZE)?
3. Are there N+1 queries?
4. Can we use indices to optimize?
5. Should we cache this?
6. What happens under high load?
7. Are there race conditions?
8. Is this operation atomic?

**Must Review**:
- Database query performance
- Index coverage
- Caching strategy
- Async vs sync operations
- Connection pooling

---

#### 🗄️ Expert 3: Data Architect
**Expertise**: Schema design, data integrity, consistency, migrations

**Questions to Ask**:
1. Is this schema normalized correctly?
2. Are foreign keys and constraints in place?
3. What happens during migration?
4. Can we rollback safely?
5. Is data consistency maintained?
6. Are there orphaned records possible?
7. Do we need cascading deletes?
8. Is the data type appropriate?

**Must Review**:
- Schema changes
- Migration safety
- Data integrity constraints
- Referential integrity
- Idempotency

---

#### 🎨 Expert 4: Frontend/UX Engineer  
**Expertise**: User experience, React patterns, state management, accessibility

**Questions to Ask**:
1. Is the UX intuitive?
2. Are loading states handled?
3. Are errors user-friendly?
4. Is it accessible (WCAG 2.1)?
5. Does it work on mobile?
6. Are there race conditions in state?
7. Is the component tree optimized?
8. Do we need optimistic updates?

**Must Review**:
- Component structure
- State management
- Error boundaries
- Loading states
- Accessibility

---

#### 🔬 Expert 5: Principal Engineer (Integration & Systems)
**Expertise**: End-to-end flow, integration points, edge cases, failure modes

**Questions to Ask**:
1. What's the complete end-to-end flow?
2. Where can this break silently?
3. What are ALL the edge cases?
4. How do we handle failures?
5. What's the rollback strategy?
6. Are there hidden dependencies?
7. What breaks if this fails?
8. Is monitoring in place?

**Must Review**:
- Integration points
- Error recovery
- Edge cases
- Monitoring/observability
- Deployment risk

---

### PHASE 3: CODEBASE CONSISTENCY CHECK

**Goal**: Ensure changes align with existing patterns

#### 3.1 Pattern Matching
```
CHECK AGAINST:
✓ Existing similar features (how were they implemented?)
✓ Database function naming (public vs private schema)
✓ Edge Function structure (dual-client pattern)
✓ Error handling (errorResponse function)
✓ API client patterns (fetchWithAuth helper)
✓ Component structure (Server vs Client components)
```

#### 3.2 Dependency Analysis
```
VERIFY:
✓ No circular dependencies
✓ Package versions compatible
✓ No deprecated APIs used
✓ TypeScript types properly defined
✓ Imports follow project structure
```

#### 3.3 Anti-Pattern Detection
```
AVOID:
✗ Hardcoded values (use env vars)
✗ Direct database access (use RPC functions)
✗ Missing error handling
✗ Unauthenticated endpoints
✗ SQL injection vulnerabilities
✗ N+1 queries
✗ Duplicate code (DRY principle)
```

**OUTPUT**: Consistency report showing alignment with existing patterns

---

### PHASE 4: SOLUTION BLUEPRINT (Pre-Implementation)

**⚠️ NO CODE YET - ONLY DESIGN**

#### 4.1 Approach Selection
```
CHOOSE ONE:
□ Surgical Fix (minimal change, low risk)
□ Refactor (medium change, medium risk)
□ Rewrite (major change, high risk)

JUSTIFY: Why this approach over alternatives?
```

#### 4.2 Impact Analysis
```
DOCUMENT:
- Files to modify (exact paths)
- Files to create (exact paths)
- Database migrations needed
- Edge Functions to deploy
- Breaking changes (if any)
- Rollback plan
```

#### 4.3 Technical Design Document
```markdown
## Solution Design

### Problem Statement
[Clear description of what we're solving]

### Proposed Solution
[High-level approach]

### Architecture Changes
[Diagrams, data flow, sequence diagrams]

### Database Changes
[Schema modifications, migrations]

### API Changes
[New endpoints, modified endpoints]

### Frontend Changes
[Component changes, state management]

### Security Considerations
[Auth, RLS, validation]

### Performance Considerations
[Indices, caching, optimization]

### Testing Strategy
[Unit, integration, E2E tests]

### Deployment Plan
[Step-by-step deployment]

### Rollback Plan
[How to undo if it fails]
```

**OUTPUT**: Complete blueprint document for review

---

### PHASE 5: EXPERT PANEL REVIEW OF BLUEPRINT

**Goal**: Identify flaws BEFORE coding

#### 5.1 Security Review
```
Expert 1 (Security) reviews blueprint:
- Are there security holes?
- Is authentication/authorization correct?
- Are inputs validated?
- Is output sanitized?
```

#### 5.2 Performance Review
```
Expert 2 (Performance) reviews blueprint:
- Will this scale?
- Are queries optimized?
- Is caching appropriate?
- What's the worst-case latency?
```

#### 5.3 Data Integrity Review
```
Expert 3 (Data) reviews blueprint:
- Is schema design sound?
- Can data become inconsistent?
- Is migration safe?
- What about data corruption scenarios?
```

#### 5.4 UX Review
```
Expert 4 (UX) reviews blueprint:
- Is user experience smooth?
- Are all states handled?
- Is it accessible?
- Does it work on all devices?
```

#### 5.5 Integration Review
```
Expert 5 (Systems) reviews blueprint:
- Does end-to-end flow make sense?
- What if external systems fail?
- Are all edge cases covered?
- Is monitoring sufficient?
```

**OUTPUT**: List of issues found, required blueprint revisions

---

### PHASE 6: BLUEPRINT REVISION

**Goal**: Fix all issues found in Phase 5

#### 6.1 Address Security Issues
```
For each security issue:
- Explain the vulnerability
- Propose mitigation
- Update blueprint
```

#### 6.2 Address Performance Issues
```
For each performance issue:
- Explain the bottleneck
- Propose optimization
- Update blueprint
```

#### 6.3 Address Other Issues
```
For all remaining issues:
- Validate concern
- Revise design
- Document decision
```

**OUTPUT**: Revised blueprint v2.0

---

### PHASE 7: FAANG-LEVEL CODE REVIEW (Pre-Implementation)

**Goal**: Final validation before coding

#### 7.1 Senior Engineer Review
```
Imagine a FAANG Staff Engineer reviewing this:
- Would they approve this design?
- What questions would they ask?
- What would make them reject it?
- What concerns would they raise?
```

#### 7.2 Tech Lead Review
```
Imagine your Tech Lead reviewing this:
- Does it align with team standards?
- Is it maintainable?
- Is it testable?
- Does it introduce tech debt?
```

#### 7.3 Architect Review
```
Imagine a Principal Architect reviewing this:
- Does it fit the overall architecture?
- Does it create coupling?
- Is it future-proof?
- Does it enable or block future features?
```

**OUTPUT**: Final approval or required changes

---

### PHASE 8: IMPLEMENTATION

**⚠️ ONLY NOW can you write code**

#### 8.1 Implementation Guidelines
```
FOLLOW THESE RULES:
✓ Write code in small, testable chunks
✓ Add comprehensive comments
✓ Include error handling for every operation
✓ Add logging for debugging
✓ Write tests alongside code
✓ Follow TypeScript strict mode
✓ Use existing helper functions
✓ Match existing code style
```

#### 8.2 Code Quality Checklist
```
BEFORE COMMITTING:
□ TypeScript compiles without errors
□ All linting rules pass
□ No console.log statements left
□ Error handling complete
□ Edge cases covered
□ Comments explain "why" not "what"
□ No hardcoded values
□ Tests written and passing
```

#### 8.3 Security Checklist
```
SECURITY VERIFICATION:
□ Input validation on all user data
□ Output sanitization
□ SQL injection prevented (use parameterized queries)
□ XSS prevented
□ CSRF protection if needed
□ Authentication required
□ Authorization enforced (RLS/JWT)
□ Secrets not in code (use env vars)
```

**OUTPUT**: Implemented code ready for review

---

### PHASE 9: POST-IMPLEMENTATION REVIEW

**Goal**: Catch bugs before deployment

#### 9.1 Self-Review
```
REVIEW YOUR OWN CODE:
- Read every line as if someone else wrote it
- Test every code path
- Try to break it
- Check for edge cases
- Verify error messages are helpful
```

#### 9.2 Expert Panel Re-Review
```
Have each expert review actual implementation:
- Security: Any vulnerabilities introduced?
- Performance: Any bottlenecks created?
- Data: Any integrity issues?
- UX: Any poor user experiences?
- Systems: Any integration issues?
```

#### 9.3 Testing Verification
```
RUN ALL TESTS:
□ Unit tests pass
□ Integration tests pass
□ E2E tests pass
□ Manual testing complete
□ Edge cases tested
□ Error scenarios tested
□ Performance acceptable
```

**OUTPUT**: Issues found, required fixes

---

### PHASE 10: BUG FIXING & REFINEMENT

**Goal**: Achieve zero known issues

#### 10.1 Fix All Issues
```
For each issue found in Phase 9:
- Understand root cause
- Implement fix
- Re-test
- Verify fix doesn't introduce new issues
```

#### 10.2 Regression Testing
```
AFTER FIXES:
□ All tests still pass
□ No new issues introduced
□ Original functionality preserved
□ Performance still acceptable
```

#### 10.3 Final Validation
```
CHECKLIST:
□ Meets all requirements
□ No known bugs
□ Tests comprehensive
□ Documentation complete
□ Ready for production
```

**OUTPUT**: Production-ready code

---

## 🎯 SUCCESS CRITERIA

You have completed this protocol successfully when:

1. ✅ **All 10 phases completed** in order
2. ✅ **5 experts consulted** and concerns addressed
3. ✅ **Blueprint approved** by all reviewers
4. ✅ **Code quality** meets FAANG standards
5. ✅ **Tests comprehensive** and passing
6. ✅ **Security validated** with no vulnerabilities
7. ✅ **Performance acceptable** under load
8. ✅ **Documentation complete** and clear
9. ✅ **No known bugs** or issues
10. ✅ **Consistent** with existing codebase patterns

---

## 🚫 WHAT NOT TO DO

**NEVER**:
- ❌ Skip phases to save time
- ❌ Write code before blueprint approval
- ❌ Ignore expert feedback
- ❌ Copy-paste code without understanding
- ❌ Commit without testing
- ❌ Leave TODO comments for later
- ❌ Introduce breaking changes without migration plan
- ❌ Deploy without rollback plan
- ❌ Assume it works without testing
- ❌ Ignore TypeScript errors

---

## 📚 KB STYLISH SPECIFIC CONTEXT

### Project Architecture
```
KB STYLISH - Multi-vendor E-commerce + Booking Platform
Tech Stack:
- Frontend: Next.js 15 (App Router, Server Components)
- Backend: Supabase (PostgreSQL + Edge Functions)
- Auth: JWT with role-based access (admin/vendor/customer)
- State: Zustand stores
- Styling: Tailwind CSS
- Testing: Playwright E2E
```

### Key Systems
```
1. AUTHENTICATION
   - JWT tokens with user_metadata.user_roles
   - RLS policies on all tables
   - public.user_has_role() helper function

2. GOVERNANCE ENGINE
   - metrics schema (vendor_daily, platform_daily)
   - Real-time dashboard for admin/vendor
   - Event-driven metrics updates

3. COMMERCE ENGINE
   - Cart system (guest + authenticated)
   - Order processing pipeline
   - Inventory management with OCC

4. TRUST ENGINE
   - Review system with purchase verification
   - Sharded vote counters
   - Vendor reply system

5. EDGE FUNCTIONS
   - Dual-client pattern (userClient + serviceClient)
   - Auth in global headers
   - CORS with specific origins
```

### Existing Patterns
```
DATABASE FUNCTIONS:
- public.* = SECURITY INVOKER (inherits user's RLS)
- private.* = SECURITY DEFINER (bypasses RLS for admin)
- Always SET search_path = 'schema1, schema2, pg_temp'
- Self-defending: Check auth.uid() and roles

EDGE FUNCTIONS:
- createDualClients(authHeader) for user + service clients
- verifyUser() for JWT extraction
- errorResponse() for consistent errors
- getCorsHeaders() for CORS

FRONTEND:
- Async Server Components for data fetching
- Client components for interactivity
- fetchWithAuth() for API calls
- Error boundaries for graceful failures
```

### Migration Pattern
```sql
-- ALWAYS use timestamped migrations
-- Format: YYYYMMDDHHMMSS_descriptive_name.sql

-- Example:
-- 20251012120000_add_metrics_reconciliation.sql

BEGIN;
  -- Make changes here
  -- Include rollback plan as comments
COMMIT;
```

---

## 🎓 INVESTIGATION PRINCIPLES

### 1. **Assume Nothing**
- Even if code looks correct, verify it works
- Even if documentation says something, test it
- Even if tests pass, manually verify behavior

### 2. **Follow the Data**
- Trace data through EVERY layer
- Verify persistence at each step
- Check for gaps in the flow

### 3. **Think Like an Attacker**
- How would you exploit this?
- What's the worst-case scenario?
- What if inputs are malicious?

### 4. **Think Like a User**
- What's the UX for errors?
- Is it intuitive?
- Does it work on slow connections?

### 5. **Think Like a Database**
- What's the query plan?
- Are there locks?
- What happens under concurrent load?

---

## 📞 WHEN TO ASK FOR HELP

**ASK THE USER IF**:
1. Requirements unclear or ambiguous
2. Multiple valid approaches exist
3. Breaking changes required
4. Major architectural decision needed
5. Business logic assumptions needed
6. Performance tradeoffs unclear
7. Security implications uncertain

**DON'T ASK THE USER IF**:
1. Syntax errors (fix yourself)
2. Best practices (follow them)
3. Code style (match existing)
4. Bug fixes (fix and explain)
5. Test writing (write them)

---

## 🚀 START HERE FOR ANY TASK

```markdown
## Task: [Brief description]

### Phase 1: Codebase Immersion ⏳
- [ ] Read architecture docs
- [ ] Map relevant systems  
- [ ] Identify existing patterns
- [ ] Search for similar code

### Phase 2: Expert Panel Consultation ⏳
- [ ] Security Architect review
- [ ] Performance Engineer review
- [ ] Data Architect review
- [ ] UX Engineer review
- [ ] Principal Engineer review

### Phase 3: Consistency Check ⏳
- [ ] Pattern matching complete
- [ ] Dependencies verified
- [ ] Anti-patterns avoided

### Phase 4: Solution Blueprint ⏳
- [ ] Approach selected
- [ ] Impact analysis done
- [ ] Technical design written

### Phase 5: Blueprint Review ⏳
- [ ] Security review passed
- [ ] Performance review passed
- [ ] Data review passed
- [ ] UX review passed
- [ ] Integration review passed

### Phase 6: Blueprint Revision ⏳
- [ ] All issues addressed
- [ ] Blueprint v2.0 complete

### Phase 7: FAANG Review ⏳
- [ ] Senior Engineer approval
- [ ] Tech Lead approval
- [ ] Architect approval

### Phase 8: Implementation ⏳
- [ ] Code written
- [ ] Tests written
- [ ] Quality checklist passed

### Phase 9: Post-Implementation Review ⏳
- [ ] Self-review complete
- [ ] Expert re-review done
- [ ] All tests passing

### Phase 10: Bug Fixing ⏳
- [ ] All issues fixed
- [ ] Regression tests pass
- [ ] Production ready ✅
```

---

**Remember**: A week of coding can save an hour of thinking.  
**Think first. Design thoroughly. Then code surgically.**

---

**PROTOCOL VERSION**: 2.0  
**LAST UPDATED**: October 12, 2025  
**MAINTAINED BY**: KB Stylish Engineering Team
