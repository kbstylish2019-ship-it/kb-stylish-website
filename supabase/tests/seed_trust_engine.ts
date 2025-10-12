#!/usr/bin/env tsx

/**
 * Trust Engine Test Seeder
 * - Creates Test Vendor, Test Customer (and a secondary Non-Owner Vendor)
 * - Creates a Test Product owned by Test Vendor (with variant, inventory, image)
 * - Creates a delivered Order linking Test Customer to the Test Product
 * - Creates several pre-existing reviews by other fake users
 * - Writes out a JSON artifact with IDs for E2E tests
 *
 * Usage:
 *  pnpm tsx supabase/tests/seed_trust_engine.ts
 *  npm  run  seed:trust
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
});

type SeedResult = {
  vendor: { id: string; email: string };
  vendor2: { id: string; email: string };
  customer: { id: string; email: string };
  product: { id: string; slug: string; name: string };
  variant: { id: string };
  order: { id: string };
  seededReviews: Array<{ id: string; author_id: string; title: string }>;
};

async function ensureUser(client: SupabaseClient, email: string, password: string, fullName: string) {
  // Try to create; if exists, fetch
  let userId: string | null = null;
  try {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (error) throw error;
    userId = data.user?.id ?? null;
  } catch (e: any) {
    // Fallback: list and find by email
    const { data: list } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    userId = found?.id ?? null;
  }
  if (!userId) throw new Error(`Unable to create or find user for ${email}`);

  // Ensure user_profiles exists with actual schema (username + display_name required)
  let profileExists = false;
  try {
    const { data: profile } = await client
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    profileExists = !!profile;
  } catch {}

  if (!profileExists) {
    const now = new Date().toISOString();
    const username = (email.split('@')[0] || `user_${userId.slice(0, 8)}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
    try {
      const { error } = await client.from('user_profiles').insert({
        id: userId,
        username,
        display_name: fullName,
        is_verified: true,
        role_version: 1,
        created_at: now,
        updated_at: now,
      } as any);
      if (error) {
        console.warn('[seed_trust_engine] user_profiles insert error (continuing):', error);
      }
    } catch (e) {
      console.warn('[seed_trust_engine] user_profiles insert exception (continuing):', e);
    }
  }
  return userId;
}

async function ensureRoleVendor(client: SupabaseClient, userId: string) {
  // Attempt roles (id-based) -> user_roles(user_id, role_id)
  // If that fails, fallback to text-based user_roles(user_id, role)
  // If neither exists, we skip (JWT claims hook will default to customer)
  const rolesCheck = await client.from('roles').select('id, name').limit(1);
  if (!rolesCheck.error) {
    // Upsert vendor role
    let vendorRoleId: string | null = null;
    const { data: roleList } = await client.from('roles').select('id, name').eq('name', 'vendor');
    if (roleList && roleList.length > 0) {
      vendorRoleId = roleList[0].id;
    } else {
      const { data: newRole } = await client.from('roles').insert({ name: 'vendor' }).select('id').single();
      vendorRoleId = newRole?.id ?? null;
    }
    if (vendorRoleId) {
      // Link user -> vendor role if not already
      const { data: link } = await client
        .from('user_roles')
        .select('user_id, role_id')
        .eq('user_id', userId)
        .eq('role_id', vendorRoleId)
        .maybeSingle();
      if (!link) {
        await client.from('user_roles').insert({ user_id: userId, role_id: vendorRoleId });
      }
    }
    return;
  }
  // Fallback: user_roles with text column
  const rolesTextCheck = await client.from('user_roles').select('user_id, role').limit(1);
  if (!rolesTextCheck.error) {
    const { data: existing } = await client
      .from('user_roles')
      .select('user_id, role')
      .eq('user_id', userId)
      .eq('role', 'vendor')
      .maybeSingle();
    if (!existing) {
      await client.from('user_roles').insert({ user_id: userId, role: 'vendor' });
    }
  }
}

async function ensureCategoryAndBrand(client: SupabaseClient) {
  let categoryId: string | null = null;
  let brandId: string | null = null;
  const { data: cat } = await client.from('categories').select('id').limit(1);
  if (!cat || cat.length === 0) {
    const { data: newCat } = await client
      .from('categories')
      .insert({ name: 'Test Category', slug: 'test-category', description: 'E2E Category', is_active: true })
      .select('id')
      .single();
    categoryId = newCat!.id;
  } else categoryId = cat[0].id;

  const { data: brand } = await client.from('brands').select('id').limit(1);
  if (!brand || brand.length === 0) {
    const { data: newBrand } = await client
      .from('brands')
      .insert({ name: 'Test Brand', slug: 'test-brand', description: 'E2E Brand', is_active: true })
      .select('id')
      .single();
    brandId = newBrand!.id;
  } else brandId = brand[0].id;

  return { categoryId: categoryId!, brandId: brandId! };
}

async function ensureInventoryLocation(client: SupabaseClient, vendorProfileId: string) {
  const { data: loc } = await client
    .from('inventory_locations')
    .select('id')
    .eq('vendor_id', vendorProfileId)
    .eq('is_default', true)
    .maybeSingle();
  if (loc) return loc.id;
  const { data: newLoc } = await client
    .from('inventory_locations')
    .insert({ vendor_id: vendorProfileId, name: 'Main Warehouse', address: 'Kathmandu, Nepal', is_default: true, is_active: true })
    .select('id')
    .single();
  return newLoc!.id as string;
}

async function run(): Promise<SeedResult> {
  const vendorEmail = 'vendor.trust@kbstylish.test';
  const vendor2Email = 'vendor2.trust@kbstylish.test';
  const customerEmail = 'customer.trust@kbstylish.test';
  const defaultPassword = 'KBS!tylish1234';

  const vendorId = await ensureUser(admin, vendorEmail, defaultPassword, 'Test Vendor');
  const vendor2Id = await ensureUser(admin, vendor2Email, defaultPassword, 'Other Vendor');
  const customerId = await ensureUser(admin, customerEmail, defaultPassword, 'Test Customer');

  // Ensure vendor role assignment (best-effort)
  await ensureRoleVendor(admin, vendorId);
  await ensureRoleVendor(admin, vendor2Id);
  
  // Ensure vendor_profiles exist for order_items FK constraint
  const { error: vpError } = await admin.from('vendor_profiles').upsert([
    { 
      user_id: vendorId,
      business_name: 'Test Vendor Business',
      verification_status: 'verified',
      commission_rate: 0.1000
    },
    {
      user_id: vendor2Id,
      business_name: 'Other Vendor Business',
      verification_status: 'verified', 
      commission_rate: 0.1000
    }
  ], { onConflict: 'user_id' });
  
  if (vpError) {
    console.error('[seed_trust_engine] vendor_profiles upsert error:', vpError);
    throw vpError;
  }

  // Ensure category/brand
  const { categoryId, brandId } = await ensureCategoryAndBrand(admin);

  // Sanity checks: ensure FK targets exist
  const { data: vendorProfile } = await admin
    .from('user_profiles')
    .select('id')
    .eq('id', vendorId)
    .maybeSingle();
  if (!vendorProfile) {
    console.warn('[seed_trust_engine] Warning: Missing user_profiles row for vendorId, falling back to auth user id for vendor context:', vendorId);
  }
  const { data: brandRow } = await admin.from('brands').select('id').eq('id', brandId).maybeSingle();
  if (!brandRow) {
    console.error('[seed_trust_engine] Missing brands row for brandId:', brandId);
    throw new Error('Brand not found');
  }
  const { data: categoryRow } = await admin.from('categories').select('id').eq('id', categoryId).maybeSingle();
  if (!categoryRow) {
    console.error('[seed_trust_engine] Missing categories row for categoryId:', categoryId);
    throw new Error('Category not found');
  }

  // Create test product owned by vendor (use user_profiles.id to satisfy FK exactly)
  const vendorProfileId = ((vendorProfile?.id as string) ?? vendorId);
  const slug = `trust-engine-product-${Math.random().toString(36).slice(2, 7)}`;
  console.log('[seed_trust_engine] Attempt product insert with vendorProfileId:', vendorProfileId);
  let product: { id: string; slug: string; name: string; vendor_id?: string } | null = null;
  let productErr: any = null;
  try {
    const res = await admin
      .from('products')
      .insert({
        vendor_id: vendorProfileId,
        brand_id: brandId,
        category_id: categoryId,
        name: 'Trust Engine Test Product',
        slug,
        description: 'E2E Trust Engine product',
        is_active: true,
        is_featured: false
      })
      .select('id, slug, name, vendor_id')
      .single();
    product = res.data as any;
    productErr = res.error;
  } catch (e) {
    productErr = e;
  }

  // Fallback: try vendorId directly if first attempt fails with FK issue
  if (!product && productErr) {
    console.error('[seed_trust_engine] First product insert failed:', productErr);
    console.log('[seed_trust_engine] Fallback product insert with vendorId auth user id:', vendorId);
    try {
      const alt = await admin
        .from('products')
        .insert({
          vendor_id: vendorId,
          brand_id: brandId,
          category_id: categoryId,
          name: 'Trust Engine Test Product',
          slug,
          description: 'E2E Trust Engine product',
          is_active: true,
          is_featured: false
        })
        .select('id, slug, name, vendor_id')
        .single();
      product = alt.data as any;
      productErr = alt.error;
    } catch (e2) {
      productErr = e2;
    }
  }

  if (productErr || !product) {
    console.error('[seed_trust_engine] Product insert failed; attempting fallback to existing product...', productErr);
    const { data: fallbackProduct } = await admin
      .from('products')
      .select('id, slug, name, vendor_id')
      .limit(1)
      .maybeSingle();
    if (!fallbackProduct) {
      console.error('[seed_trust_engine] No existing product found to fallback. Aborting.');
      throw productErr || new Error('No product available');
    }
    product = fallbackProduct as any;
  }

  // Determine actual product owner profile ID and normalize vendor context
  const productId = (product as any).id as string;
  const ownerProfileId = ((product as any).vendor_id ?? vendorProfileId) as string;
  console.log('[seed_trust_engine] Using product', { productId, ownerProfileId });

  // Ensure we can login as product owner vendor: set/reset password via admin API
  try {
    const vendorUser = await admin.auth.admin.getUserById(ownerProfileId);
    if (vendorUser?.data?.user?.email) {
      // set a known password for E2E
      await admin.auth.admin.updateUserById(ownerProfileId, { password: defaultPassword });
    } else {
      // Fallback: try to find by id in listUsers
      const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = (list?.data?.users || []).find((u: any) => u.id === ownerProfileId);
      if (found) {
        await admin.auth.admin.updateUserById(ownerProfileId, { password: defaultPassword });
      }
    }
  } catch (e) {
    console.warn('[seed_trust_engine] Unable to reset vendor owner password; proceeding', e);
  }

  // Create or fetch a variant for the product (robust)
  let variant: { id: string } | null = null;
  const { data: existingVar } = await admin
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle();
  if (existingVar) {
    variant = existingVar as any;
  } else {
    try {
      const resVar = await admin
        .from('product_variants')
        .insert({ product_id: productId, sku: `SKU-${Date.now()}`, price: 999, is_active: true })
        .select('id')
        .single();
      if (resVar.error) {
        console.error('[seed_trust_engine] Variant insert error:', resVar.error);
      }
      variant = (resVar.data as any) ?? null;
    } catch (e) {
      console.error('[seed_trust_engine] Variant insert exception:', e);
    }
  }
  if (!variant) {
    throw new Error('[seed_trust_engine] Unable to create or fetch a product variant for seeding.');
  }

  try {
    const locationId = await ensureInventoryLocation(admin, ownerProfileId);
    // Inventory for variant
    await admin.from('inventory').insert({
      variant_id: variant!.id,
      location_id: locationId,
      quantity_available: 50,
      quantity_reserved: 0,
      quantity_incoming: 0
    });
  } catch (e) {
    console.warn('[seed_trust_engine] Inventory seeding skipped (non-fatal):', e);
  }

  // Image (best-effort)
  try {
    const imgRes = await admin.from('product_images').insert({
      product_id: productId,
      image_url: 'https://images.unsplash.com/photo-1516822003754-cca485356ecb?q=80&w=1200&auto=format&fit=crop',
      is_primary: true,
      sort_order: 0
    }).select('id').single();
    if (imgRes.error) console.warn('[seed_trust_engine] product_images insert error (non-fatal):', imgRes.error);
  } catch (e) {
    console.warn('[seed_trust_engine] product_images insert exception (non-fatal):', e);
  }

  // Create an order for the Test Customer linking to the product (delivered)
  const { data: variantSkuRow } = await admin
    .from('product_variants')
    .select('id, sku')
    .eq('id', variant!.id)
    .single();
  const variantSku = variantSkuRow?.sku || `SKU-${Date.now()}`;

  const orderNumber = `TEST-${Date.now()}`;
  const paymentIntentId = `pi_${Math.random().toString(36).slice(2, 10)}`;
  const unitPriceCents = 99900; // NPR 999.00
  const subtotalCents = unitPriceCents * 1;
  const taxCents = 0;
  const shippingCents = 0;
  const discountCents = 0;
  const totalCents = subtotalCents + taxCents + shippingCents - discountCents;

  // Create or reuse cart and create payment intent to satisfy FK constraints
  // First try to get existing cart
  const { data: existingCart } = await admin
    .from('carts')
    .select('id')
    .eq('user_id', customerId)
    .maybeSingle();
  
  let cartId: string | undefined = existingCart?.id;
  
  // If no cart exists, create one
  if (!cartId) {
    const { data: newCart, error: cartErr } = await admin
      .from('carts')
      .insert({ user_id: customerId })
      .select('id')
      .single();
    
    if (cartErr) {
      console.error('[seed_trust_engine] Cart creation error:', cartErr);
      throw cartErr;
    }
    cartId = newCart?.id;
  }
  
  if (!cartId) throw new Error('[seed_trust_engine] Failed to create or fetch cart for customer');

  const { error: piErr } = await admin
    .from('payment_intents')
    .insert({
      user_id: customerId,
      cart_id: cartId,
      payment_intent_id: paymentIntentId,
      amount_cents: totalCents,
      currency: 'NPR',
      status: 'succeeded',
      provider: 'mock_provider',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    });
  if (piErr) {
    console.error('[seed_trust_engine] payment_intents insert error:', piErr);
    throw piErr;
  }

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: customerId,
      payment_intent_id: paymentIntentId,
      status: 'delivered',
      delivered_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Delivered yesterday
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      shipping_cents: shippingCents,
      discount_cents: discountCents,
      total_cents: totalCents,
      currency: 'NPR',
      shipping_name: 'Test Customer',
      shipping_phone: '9800000000',
      shipping_address_line1: 'Test Street 123',
      shipping_city: 'Kathmandu',
      shipping_state: 'Bagmati',
      shipping_postal_code: '44600',
      shipping_country: 'NP',
      notes: 'E2E Trust Engine seed order'
    })
    .select('id')
    .single();

  // Ensure order was created before using order.id
  if (orderErr) {
    console.error('[seed_trust_engine] Order insert error:', orderErr);
    throw orderErr;
  }
  if (!order) {
    throw new Error('[seed_trust_engine] Order insert failed (no data)');
  }

  // delivered_at and user_id are already set appropriately; no post-insert updates needed

  // Insert order item snapshot (matches actual schema)
  const { error: orderItemErr } = await admin.from('order_items').insert({
    order_id: order!.id,
    variant_id: variant!.id,
    product_id: productId,
    vendor_id: ownerProfileId,
    product_name: (product as any).name || 'Seed Product',
    product_slug: (product as any).slug || 'seed-product',
    variant_sku: variantSku,
    quantity: 1,
    unit_price_cents: unitPriceCents,
    total_price_cents: subtotalCents
  });
  
  if (orderItemErr) {
    console.error('[seed_trust_engine] Order item insert error:', orderItemErr);
    throw orderItemErr;
  }

  // Create a few pre-existing reviews by fake users for the product
  const seededReviews: Array<{ id: string; author_id: string; title: string }> = [];
  for (let i = 1; i <= 2; i++) {
    const fakeEmail = `seed.reviewer${i}@kbstylish.test`;
    const fakeId = await ensureUser(admin, fakeEmail, defaultPassword, `Seed Reviewer ${i}`);
    const { data: review } = await admin
      .from('reviews')
      .insert({
        product_id: productId,
        user_id: fakeId,
        order_id: order!.id,
        rating: 4,
        title: `Seeded review ${i}`,
        comment: `Seeded review ${i} content for trust engine.`,
        is_approved: true,
        moderation_status: 'approved'
      })
      .select('id')
      .single();
    seededReviews.push({ id: review!.id, author_id: fakeId, title: `Seeded review ${i}` });
  }

  // Resolve vendor owner email for test login
  let ownerEmail = vendorEmail;
  try {
    const { data: uu } = await admin.auth.admin.getUserById(ownerProfileId);
    ownerEmail = (uu?.user?.email as string) || ownerEmail;
  } catch {}

  const result: SeedResult = {
    vendor: { id: ownerProfileId, email: ownerEmail },
    vendor2: { id: vendor2Id, email: vendor2Email },
    customer: { id: customerId, email: customerEmail },
    product: { id: productId, slug: (product as any).slug, name: (product as any).name },
    variant: { id: variant!.id },
    order: { id: order!.id },
    seededReviews
  };

  const outDir = path.join('supabase', 'tests');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'trust_seed.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  return result;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Export for programmatic use in tests
export { run };
