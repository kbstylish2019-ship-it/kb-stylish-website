import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Create Supabase client for auth refresh operations
async function createClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

/**
 * Force refresh JWT token to sync role_version with database
 * This should be called when role version mismatch is detected
 */
export async function forceTokenRefresh(): Promise<{
  success: boolean
  error?: string
  newRoleVersion?: number
}> {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return {
        success: false,
        error: 'No authenticated user found'
      }
    }

    // Call the database function to refresh JWT claims
    const { data: refreshResult, error: refreshError } = await supabase
      .rpc('refresh_user_jwt_claims', { user_uuid: user.id })

    if (refreshError) {
      console.error('JWT refresh error:', refreshError)
      return {
        success: false,
        error: refreshError.message
      }
    }

    // Force refresh the session to get updated claims
    const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession()
    
    if (sessionError) {
      console.error('Session refresh error:', sessionError)
      return {
        success: false,
        error: sessionError.message
      }
    }

    const newRoleVersion = sessionData.session?.user?.user_metadata?.role_version || 
                          sessionData.session?.user?.app_metadata?.role_version

    console.log('✅ JWT token refreshed successfully', { 
      newRoleVersion,
      refreshResult 
    })

    return {
      success: true,
      newRoleVersion
    }

  } catch (error) {
    console.error('Force token refresh error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check if user needs to refresh their JWT token due to role version mismatch
 * Returns true if refresh is needed
 */
export async function checkTokenRefreshNeeded(): Promise<boolean> {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return false
    }

    const jwtRoleVersion = user.user_metadata?.role_version || 
                          user.app_metadata?.role_version || 1

    // Get current role version from database
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role_version')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return false
    }

    return jwtRoleVersion !== profile.role_version
  } catch (error) {
    console.error('Error checking token refresh need:', error)
    return false
  }
}

/**
 * Auto-refresh token if needed and return whether refresh occurred
 */
export async function autoRefreshIfNeeded(): Promise<boolean> {
  const needsRefresh = await checkTokenRefreshNeeded()
  
  if (needsRefresh) {
    console.log('🔄 Auto-refreshing JWT token due to role version mismatch')
    const result = await forceTokenRefresh()
    return result.success
  }
  
  return false
}
