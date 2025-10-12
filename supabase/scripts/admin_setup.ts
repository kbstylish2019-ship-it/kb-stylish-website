/*
  KB Stylish - Test Enablement Package: Admin/Vendor Setup Script
  Usage:
    - Set environment variables:
        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
        ADMIN_EMAIL, ADMIN_PASSWORD
        VENDOR_EMAIL (optional), VENDOR_PASSWORD (optional)
    - Run with Node (>=18) or Deno (with npm compat):
        node supabase/scripts/admin_setup.ts
*/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const url = Deno.env.get("SUPABASE_URL");
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !service) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  Deno.exit(1);
}

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "admin.trust@kbstylish.test";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") ?? "password123";
const VENDOR_EMAIL = Deno.env.get("VENDOR_EMAIL") ?? "vendor.demo@kbstylish.test";
const VENDOR_PASSWORD = Deno.env.get("VENDOR_PASSWORD") ?? "password123";

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email: string) {
  // Supabase Admin API does not filter by email directly; paginate a small set
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

async function ensureUser(email: string, password: string) {
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user ?? null;
    console.log("Created user:", email, user?.id);
  } else {
    // Update password to known value
    const { data, error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log("Updated password for:", email);
  }
  if (!user) throw new Error("User not found/created: " + email);
  return user;
}

async function getRoleId(roleName: string) {
  const { data, error } = await admin.from("roles").select("id").eq("name", roleName).limit(1).single();
  if (error) throw error;
  return data.id as string;
}

async function assignRole(userId: string, roleId: string) {
  // Mark any existing assignments inactive, then upsert a new active one
  await admin.from("user_roles").update({ is_active: false }).eq("user_id", userId).eq("role_id", roleId);
  const { error } = await admin.from("user_roles").upsert({
    user_id: userId,
    role_id: roleId,
    is_active: true,
  }, { onConflict: "user_id,role_id" });
  if (error) throw error;
}

async function main() {
  const adminUser = await ensureUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const vendorUser = await ensureUser(VENDOR_EMAIL, VENDOR_PASSWORD);

  const adminRoleId = await getRoleId("admin");
  const vendorRoleId = await getRoleId("vendor");

  await assignRole(adminUser.id, adminRoleId);
  console.log("Assigned admin role to:", ADMIN_EMAIL);

  await assignRole(vendorUser.id, vendorRoleId);
  console.log("Assigned vendor role to:", VENDOR_EMAIL);

  console.log("DONE: Admin and Vendor users are ready.");
}

main().catch((e) => {
  console.error("Setup failed:", e);
  Deno.exit(1);
});
