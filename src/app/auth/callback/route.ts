import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = await cookies()
    const supabase = await createClient()
    
    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      console.log('[OAuth Callback] User authenticated via OAuth:', data.user.id)
      
      // Smart redirect based on user role
      const userRoles = data.user?.user_metadata?.user_roles || []
      let redirectPath = '/'
      
      if (userRoles.includes('admin')) {
        redirectPath = '/admin/dashboard'
      } else if (userRoles.includes('vendor')) {
        redirectPath = '/vendor/dashboard'
      } else if (userRoles.includes('stylist')) {
        redirectPath = '/stylist/dashboard'
      }
      
      // Redirect to appropriate dashboard
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  // If error or no code, redirect to home
  return NextResponse.redirect(`${origin}/`)
}
