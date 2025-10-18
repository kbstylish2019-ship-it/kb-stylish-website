import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

// Types for our authentication system
export interface UserCapabilities {
  canAccessAdmin: boolean
  canManageProducts: boolean
  canManageBookings: boolean
  canViewAnalytics: boolean
  canManageUsers: boolean
  canAccessVendorDashboard: boolean
  canAccessStylistDashboard: boolean
  canBookServices: boolean
  canViewProfile: boolean
}

export interface AuthUser {
  id: string
  email: string
  fullName: string | null
  roles: string[]
  capabilities: UserCapabilities
  roleVersion: number
}

// Create Supabase server client
async function createClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// Map roles to capabilities
function mapRolesToCapabilities(roles: string[]): UserCapabilities {
  const capabilities: UserCapabilities = {
    canAccessAdmin: false,
    canManageProducts: false,
    canManageBookings: false,
    canViewAnalytics: false,
    canManageUsers: false,
    canAccessVendorDashboard: false,
    canAccessStylistDashboard: false,
    canBookServices: false,
    canViewProfile: false,
  }

  roles.forEach(role => {
    switch (role) {
      case 'admin':
        capabilities.canAccessAdmin = true
        capabilities.canManageProducts = true
        capabilities.canManageBookings = true
        capabilities.canViewAnalytics = true
        capabilities.canManageUsers = true
        capabilities.canAccessVendorDashboard = true
        capabilities.canAccessStylistDashboard = true
        capabilities.canBookServices = true
        capabilities.canViewProfile = true
        break
      
      case 'vendor':
        capabilities.canManageProducts = true
        capabilities.canManageBookings = true
        capabilities.canViewAnalytics = true
        capabilities.canAccessVendorDashboard = true
        capabilities.canBookServices = true
        capabilities.canViewProfile = true
        break
      
      case 'stylist':
        capabilities.canAccessStylistDashboard = true
        capabilities.canManageBookings = true
        capabilities.canViewAnalytics = true
        capabilities.canBookServices = true
        capabilities.canViewProfile = true
        break
      
      case 'support':
        capabilities.canManageBookings = true
        capabilities.canViewAnalytics = true
        capabilities.canViewProfile = true
        break
      
      case 'customer':
      default:
        capabilities.canBookServices = true
        capabilities.canViewProfile = true
        break
    }
  })

  return capabilities
}

// Validate role version against database (placeholder for real-time validation)
async function validateRoleVersion(userId: string, jwtRoleVersion: number): Promise<boolean> {
  try {
    const supabase = await createClient()
    
    // Query the current role_version from the database
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role_version')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error validating role version:', error)
      return false
    }

    const currentRoleVersion = data?.role_version || 1

    // CRITICAL: Real-time validation check
    if (currentRoleVersion !== jwtRoleVersion) {
      console.log(`🚨 ROLE VERSION MISMATCH DETECTED:`)
      console.log(`   User ID: ${userId}`)
      console.log(`   JWT Role Version: ${jwtRoleVersion}`)
      console.log(`   Database Role Version: ${currentRoleVersion}`)
      console.log(`   ACTION REQUIRED: Force token refresh for user`)
      
      // In production, this would trigger:
      // 1. Force session refresh
      // 2. Security audit log entry
      // 3. Potential user notification
      // 4. Temporary capability restriction
      
      return false
    }

    return true
  } catch (error) {
    console.error('Role version validation error:', error)
    return false
  }
}

// Get current user with caching
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  try {
    const supabase = await createClient()
    
    // Get the current user (more secure than getSession)
    const { data: { user }, error: sessionError } = await supabase.auth.getUser()
    
    if (sessionError) {
      // Only log session errors that aren't expected "missing session" errors
      if (sessionError.message !== 'Auth session missing!') {
        console.error('Session error:', sessionError)
      }
      return null
    }

    if (!user) {
      return null
    }

    // Extract custom claims from JWT
    const userRoles = user.user_metadata?.user_roles || 
                     user.app_metadata?.user_roles || 
                     ['customer'] // Default fallback

    const roleVersion = user.user_metadata?.role_version || 
                       user.app_metadata?.role_version || 
                       1 // Default fallback

    // CRITICAL: Validate role version against database
    const isRoleVersionValid = await validateRoleVersion(user.id, roleVersion)
    
    if (!isRoleVersionValid) {
      console.log('🔄 Role version mismatch detected - JWT claims need manual refresh')
      console.log('💡 User should refresh the page or sign out/in to get updated permissions')
      
      // Update JWT claims in database for next session
      try {
        await supabase.rpc('refresh_user_jwt_claims', { user_uuid: user.id })
        console.log('✅ JWT claims updated in database - will take effect on next page refresh')
      } catch (error) {
        console.log('⚠️ JWT refresh error:', error)
      }
    }

    // Map roles to capabilities
    const capabilities = mapRolesToCapabilities(userRoles)

    // If role version is invalid, restrict capabilities to customer level only
    const finalCapabilities = isRoleVersionValid ? capabilities : {
      canAccessAdmin: false,
      canManageProducts: false,
      canManageBookings: false,
      canViewAnalytics: false,
      canManageUsers: false,
      canAccessVendorDashboard: false,
      canAccessStylistDashboard: false,
      canBookServices: true,
      canViewProfile: true,
    }

    return {
      id: user.id,
      email: user.email || '',
      fullName: user.user_metadata?.full_name || 
               user.user_metadata?.name || 
               null,
      roles: userRoles,
      capabilities: finalCapabilities,
      roleVersion,
    }

  } catch (error) {
    console.error('getCurrentUser error:', error)
    return null
  }
})

// Helper function to check if user has specific capability
export async function hasCapability(capability: keyof UserCapabilities): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.capabilities[capability] || false
}

// Helper function to require authentication
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('Authentication required')
  }
  
  return user
}

// Helper function to require specific capability
export async function requireCapability(capability: keyof UserCapabilities): Promise<AuthUser> {
  const user = await requireAuth()
  
  if (!user.capabilities[capability]) {
    throw new Error(`Insufficient permissions: ${capability} required`)
  }
  
  return user
}
