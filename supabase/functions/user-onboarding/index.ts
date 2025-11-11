import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
function generateUsername(email) {
  // Generate a unique username from email
  const emailPrefix = email.split('@')[0];
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${emailPrefix}_${randomSuffix}`.toLowerCase();
}
Deno.serve(async (req)=>{
  try {
    // Parse the webhook payload
    const payload = await req.json();
    // Only process INSERT events on auth.users
    if (payload.type !== 'INSERT' || payload.table !== 'users' || payload.schema !== 'auth') {
      return new Response(JSON.stringify({
        message: 'Not a user creation event'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    const user = payload.record;
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log(`Starting onboarding for user: ${user.id}`);
    // 1. Create user profile
    const username = user.email ? generateUsername(user.email) : `user_${user.id.substring(0, 8)}`;
    const { error: profileError } = await supabase.from('user_profiles').insert({
      id: user.id,
      username: username,
      display_name: user.raw_user_meta_data?.full_name || 'New User',
      avatar_url: user.raw_user_meta_data?.avatar_url || null,
      bio: null,
      is_verified: false
    });
    if (profileError) {
      console.error('Error creating user profile:', profileError);
      throw profileError;
    }
    console.log(`✓ Created user profile for ${user.id}`);
    // 2. Create private data record
    const { error: privateDataError } = await supabase.from('user_private_data').insert({
      user_id: user.id,
      email: user.email || null,
      phone: null,
      date_of_birth: null,
      preferred_language: user.raw_user_meta_data?.locale || 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      marketing_consent: false
    });
    if (privateDataError) {
      console.error('Error creating private data:', privateDataError);
      throw privateDataError;
    }
    console.log(`✓ Created private data record for ${user.id}`);
    // 3. Get customer role ID
    const { data: customerRole, error: roleError } = await supabase.from('roles').select('id').eq('name', 'customer').single();
    if (roleError || !customerRole) {
      console.error('Error fetching customer role:', roleError);
      throw new Error('Customer role not found');
    }
    console.log(`✓ Found customer role: ${customerRole.id}`);
    // 4. Assign default customer role
    const { error: userRoleError } = await supabase.from('user_roles').insert({
      user_id: user.id,
      role_id: customerRole.id,
      assigned_by: null,
      assigned_at: new Date().toISOString(),
      expires_at: null,
      is_active: true
    });
    if (userRoleError) {
      console.error('Error assigning role:', userRoleError);
      throw userRoleError;
    }
    console.log(`✓ Assigned customer role to ${user.id}`);
    // 5. Send welcome email (simulated for now)
    console.log(`📧 [SIMULATED] Sending welcome email to: ${user.email}`);
    console.log(`   Subject: Welcome to KB Stylish!`);
    console.log(`   To: ${user.email}`);
    console.log(`   Name: ${user.raw_user_meta_data?.full_name || 'Valued Customer'}`);
    // 6. Log the onboarding event (simulated for now)
    const auditLogEntry = {
      user_id: user.id,
      action: 'user_onboarded',
      resource_type: 'user',
      resource_id: user.id,
      new_values: {
        email: user.email,
        username: username,
        role: 'customer'
      },
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
      user_agent: req.headers.get('user-agent') || null,
      created_at: new Date().toISOString()
    };
    console.log(`📝 [SIMULATED] Audit log entry:`, JSON.stringify(auditLogEntry, null, 2));
    // Success response
    const response = {
      success: true,
      message: 'User onboarding completed successfully',
      user_id: user.id,
      username: username,
      steps_completed: [
        'profile_created',
        'private_data_created',
        'role_assigned',
        'welcome_email_simulated',
        'audit_log_simulated'
      ]
    };
    console.log(`✅ Onboarding completed successfully for user ${user.id}`);
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('❌ Onboarding failed:', error);
    // Log the error details
    const errorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
