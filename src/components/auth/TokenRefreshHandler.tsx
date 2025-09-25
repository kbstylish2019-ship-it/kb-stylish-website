'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Create client function (since we don't have a separate supabase/client file)
function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return document.cookie.split(';').map(cookie => {
            const [name, value] = cookie.trim().split('=')
            return { name, value }
          })
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = `${name}=${value}; ${options ? Object.entries(options).map(([k, v]) => `${k}=${v}`).join('; ') : ''}`
          })
        },
      },
    }
  )
}

/**
 * Client-side component to handle JWT token refresh when role version mismatch is detected
 * This component should be included in the root layout to monitor auth state changes
 */
export function TokenRefreshHandler() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        console.log('🔄 Auth token refreshed, revalidating page')
        // Force a page refresh to pick up new auth state
        router.refresh()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  return null // This component doesn't render anything
}

/**
 * Hook to manually trigger token refresh when role version mismatch is detected
 */
export function useTokenRefresh() {
  const router = useRouter()

  const refreshToken = async (): Promise<boolean> => {
    try {
      const supabase = createClient()
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        console.log('No authenticated user for token refresh')
        return false
      }

      // Call the database function to update JWT claims
      const { error: rpcError } = await supabase.rpc('refresh_user_jwt_claims', { 
        user_uuid: user.id 
      })

      if (rpcError) {
        console.error('Failed to refresh JWT claims:', rpcError)
        return false
      }

      // Force refresh the session
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
      
      if (refreshError) {
        console.error('Failed to refresh session:', refreshError)
        return false
      }

      if (refreshData.session) {
        console.log('✅ Token refresh successful')
        // Force page refresh to pick up new auth state
        router.refresh()
        return true
      }

      return false
    } catch (error) {
      console.error('Token refresh error:', error)
      return false
    }
  }

  return { refreshToken }
}
