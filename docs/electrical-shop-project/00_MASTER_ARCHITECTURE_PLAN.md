# 🔌 ELECTRICAL SHOP INVENTORY & ECOMMERCE SYSTEM
# Master Architecture Plan

**Project Codename**: ElectroPro  
**Date**: January 27, 2026  
**Status**: PLANNING PHASE  
**Timeline**: 5-7 Days  
**Base**: Fork of KB Stylish Marketplace  

---

## 📋 EXECUTIVE SUMMARY

### Project Overview
Transform the KB Stylish multi-vendor marketplace into a single-vendor electrical equipment shop with:
- **Inventory Management System** - Track imports, sales, stock levels across multiple locations
- **E-commerce Storefront** - Customer-facing product catalog with ordering capability
- **Single Vendor Model** - Remove multi-vendor complexity, one owner manages everything

### Why Fork KB Stylish?
| Component | KB Stylish Has | Reuse Value |
|-----------|---------------|-------------|
| Authentication | JWT + Role-based access | ✅ 100% - Just simplify roles |
| Database Schema | Products, Variants, Inventory | ✅ 90% - Already has inventory tables |
| Edge Functions | 24 deployed functions | ✅ 70% - Reuse cart, order, payment |
| Admin Dashboard | Governance engine | ✅ 80% - Perfect for inventory management |
| Vendor Portal | Product management | ✅ 95% - Becomes owner portal |
| E-commerce Flow | Cart → Checkout → Payment | ✅ 100% - Fully functional |
| Payment Gateway | Khalti + NPX integration | ✅ 100% - Already working |

### Timeline Breakdown (5-7 Days)
| Day | Focus | Deliverables |
|-----|-------|--------------|
| 1 | Project Setup & Database Clone | New Supabase project, codebase fork |
| 2 | Remove Multi-vendor, Rebrand | Strip vendor application flow, update branding |
| 3 | Enhance Inventory Management | Import tracking, movement history, multi-location |
| 4 | Customize Product Attributes | Electrical-specific (Voltage, Wattage, Brand, etc.) |
| 5 | E-commerce Customization | Update UI, category structure, checkout flow |
| 6 | Testing & Polish | End-to-end testing, bug fixes |
| 7 | Deployment | Production deployment, DNS, final checks |

---

## 🎯 PROJECT REQUIREMENTS

### Functional Requirements

#### 1. Inventory Management
- **Stock Tracking**: Real-time quantity tracking per product/variant
- **Multi-location Support**: Track inventory across multiple shops/warehouses
- **Import Tracking**: Record purchases/imports with supplier info, cost, date
- **Sales Tracking**: Automatic stock deduction on orders
- **Movement History**: Complete audit trail of all inventory changes
- **Low Stock Alerts**: Configurable thresholds with notifications
- **Stock Adjustments**: Manual corrections with reason codes

#### 2. Product Catalog
- **Categories**: Electrical-specific (Wiring, Switches, Lighting, MCBs, etc.)
- **Attributes**: Voltage, Wattage, Brand, Amperage, Wire Gauge, etc.
- **Variants**: Size, Color, Pack quantities
- **Images**: Multiple images per product
- **Search**: Full-text search with filters
- **Pricing**: Cost price, selling price, margin calculation

#### 3. E-commerce Storefront
- **Product Browsing**: Category navigation, search, filters
- **Cart**: Add to cart, quantity management
- **Checkout**: Guest checkout, address collection
- **Payment**: Khalti integration (already in KB Stylish)
- **Order Tracking**: Order status updates
- **Customer Accounts**: Optional registration

#### 4. Admin/Owner Portal
- **Dashboard**: Sales metrics, inventory status, low stock alerts
- **Products**: Full CRUD operations
- **Inventory**: Stock management, adjustments, transfers
- **Orders**: Order processing, fulfillment
- **Reports**: Sales reports, inventory reports
- **Settings**: Shop configuration

### Non-Functional Requirements
- **Performance**: Sub-2s page loads
- **Security**: Same 5-layer defense as KB Stylish
- **Mobile**: Responsive design
- **Scalability**: Handle 10K+ products, 1K+ orders/day

---

## 🏗️ ARCHITECTURE DECISION

### Decision: FORK & ADAPT (Not Clone Database)

After analyzing Supabase's cloning capabilities and the project requirements, I recommend:

**✅ FORK the Frontend Codebase** (copy repository)
**✅ CREATE NEW Supabase Project** (fresh database with adapted migrations)
**❌ DO NOT use "Restore to New Project"** (unnecessary complexity)

### Rationale

#### Why NOT Clone Database?
1. **Supabase Clone Limitations**:
   - Only copies database schema + data
   - Does NOT copy: Edge Functions, Storage settings, Auth settings, API keys
   - Requires manual reconfiguration anyway

2. **Unnecessary Data**:
   - KB Stylish has ~150 orders, 139 products, vendor-specific data
   - Electrical shop needs fresh start with clean data

3. **Schema Needs Modification**:
   - Remove vendor-related RLS policies
   - Simplify role system
   - Add electrical-specific attributes
   - Modify inventory tracking

4. **Cleaner Approach**:
   - Copy migrations, modify them
   - Apply fresh to new project
   - No legacy data cleanup needed

#### What We DO Reuse
1. **Frontend Codebase**: 100% copied, then modified
2. **Migration Files**: Copy, adapt, apply to new project
3. **Edge Functions**: Copy, modify vendor checks → owner checks
4. **Component Library**: All UI components
5. **Architecture Patterns**: Dual-client, RLS, etc.

---

## 📁 DOCUMENT STRUCTURE

This planning phase produces the following documents:

| Document | Purpose |
|----------|---------|
| `00_MASTER_ARCHITECTURE_PLAN.md` | This file - overview and decisions |
| `01_EXPERT_PANEL_DEBATE.md` | 5-expert consultation on approach |
| `02_WHAT_TO_KEEP_VS_REMOVE.md` | Detailed inventory of changes |
| `03_DATABASE_ADAPTATION_PLAN.md` | Schema modifications needed |
| `04_FRONTEND_ADAPTATION_PLAN.md` | UI/UX changes needed |
| `05_EDGE_FUNCTION_ADAPTATION.md` | Backend function changes |
| `06_STEP_BY_STEP_IMPLEMENTATION.md` | Day-by-day execution plan |
| `07_DEPLOYMENT_CHECKLIST.md` | Production deployment guide |

---

## 🔑 KEY DECISIONS SUMMARY

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database approach | New project + adapted migrations | Cleaner, no legacy data |
| Role system | Admin + Customer only | Single vendor = no vendor role needed |
| Product attributes | Extend existing system | Already has vendor-specific attributes |
| Inventory system | Use existing + enhance | Already has movements, locations |
| Payment | Keep Khalti | Already integrated |
| Auth | Keep Supabase Auth | Works perfectly |
| Hosting | Vercel | Same as KB Stylish |

---

## ⚠️ RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| Timeline pressure (5-7 days) | HIGH | Focus on core features, defer nice-to-haves |
| Missing features discovered late | MEDIUM | Clear scope definition upfront |
| Payment gateway reconfiguration | LOW | Same provider, just new credentials |
| Data migration complexity | LOW | Fresh start, no migration needed |
| Testing coverage | MEDIUM | Prioritize critical paths |

---

## ✅ SUCCESS CRITERIA

### Day 7 Deliverables
1. ✅ Owner can log in and access admin portal
2. ✅ Owner can add/edit/delete products with electrical attributes
3. ✅ Owner can manage inventory (add stock, adjust quantities)
4. ✅ Owner can view inventory movement history
5. ✅ Customers can browse products by category
6. ✅ Customers can search and filter products
7. ✅ Customers can add to cart and checkout
8. ✅ Customers can pay via Khalti
9. ✅ Owner can process and fulfill orders
10. ✅ Owner can view sales dashboard

---

## 📊 KB STYLISH CODEBASE ANALYSIS

### What Exists (Ready to Reuse)

#### Database Schema (109 migrations)
- ✅ `products` - Product catalog
- ✅ `product_variants` - Size/color variations
- ✅ `inventory` - Stock quantities
- ✅ `inventory_locations` - Multi-location support
- ✅ `inventory_movements` - Audit trail
- ✅ `product_attributes` - Custom attributes (vendor-specific supported!)
- ✅ `attribute_values` - Attribute options
- ✅ `orders` - Order management
- ✅ `order_items` - Line items
- ✅ `categories` - Product categorization
- ✅ `user_profiles` - User management
- ⚠️ `vendor_profiles` - Remove/repurpose
- ⚠️ `vendor_applications` - Remove

#### Edge Functions (24 deployed)
- ✅ `cart-manager` - Cart operations
- ✅ `create-order-intent` - Order creation
- ✅ `fulfill-order` - Order fulfillment
- ✅ `verify-payment` - Payment verification
- ✅ `khalti-webhook` - Payment webhook
- ✅ `admin-dashboard` - Dashboard stats
- ⚠️ `vendor-dashboard` - Convert to owner dashboard
- ⚠️ `submit-vendor-application` - Remove
- ✅ `review-manager` - Product reviews
- ✅ `send-email` - Email notifications

#### Frontend Pages (130+ items in app/)
- ✅ `/` - Homepage
- ✅ `/products` - Product listing
- ✅ `/products/[id]` - Product detail
- ✅ `/cart` - Shopping cart
- ✅ `/checkout` - Checkout flow
- ✅ `/admin/*` - Admin dashboard
- ⚠️ `/vendor/*` - Convert to owner portal
- ⚠️ `/become-a-vendor` - Remove
- ✅ `/account/*` - Customer account

### What's Already Perfectly Suited
The **Inventory System Upgrade** already planned in `docs/inventory-system-upgrade/` includes:
- Vendor-specific attributes (perfect for electrical attributes)
- Inventory quantity updates
- Movement tracking
- Product variant management

This is 90% of what the electrical shop needs!

---

## 🚀 NEXT STEPS

1. **Read Expert Panel Debate** → `01_EXPERT_PANEL_DEBATE.md`
2. **Review What to Keep/Remove** → `02_WHAT_TO_KEEP_VS_REMOVE.md`
3. **Understand Database Changes** → `03_DATABASE_ADAPTATION_PLAN.md`
4. **Review Frontend Changes** → `04_FRONTEND_ADAPTATION_PLAN.md`
5. **Execute Step-by-Step** → `06_STEP_BY_STEP_IMPLEMENTATION.md`

---

**Document Status**: COMPLETE  
**Next Action**: Expert Panel Debate  
**Author**: AI Architecture Assistant  
**Review Required**: Yes - User approval before implementation
