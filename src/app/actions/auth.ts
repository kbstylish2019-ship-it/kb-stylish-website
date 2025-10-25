'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Validation schemas
const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
})

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  guestToken: z.string().optional(),
})

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

// Create Supabase service role client for privileged operations
async function createServiceClient() {
  // Service role client bypasses auth and uses service role key for direct database access
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      // Service role clients don't need cookie management
      cookies: {
        get() { return null; },
        set() { },
        remove() { },
      },
    }
  )
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()

  try {
    // Validate form data
    const validatedFields = signUpSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
      fullName: formData.get('fullName'),
    })

    // Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: validatedFields.email,
      password: validatedFields.password,
      options: {
        data: {
          full_name: validatedFields.fullName,
        },
      },
    })

    if (authError) {
      console.error('Sign up error:', authError)
      return {
        error: authError.message,
        success: false,
      }
    }

    if (!authData.user) {
      return {
        error: 'Failed to create user account',
        success: false,
      }
    }

    // Check if email confirmation is required
    if (!authData.session) {
      return {
        success: true,
        message: 'Please check your email to confirm your account',
        requiresConfirmation: true,
      }
    }

    // User is signed in immediately (email confirmation disabled)
    revalidatePath('/', 'layout')
    redirect('/')

  } catch (error) {
    // NEXT_REDIRECT is expected behavior, not an error
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    
    console.error('Sign up server action error:', error)
    
    if (error instanceof z.ZodError) {
      return {
        error: error.issues[0].message,
        success: false,
      }
    }

    return {
      error: 'An unexpected error occurred during sign up',
      success: false,
    }
  }
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const cookieStore = await cookies()

  try {
    // Validate form data
    const validatedFields = signInSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
      guestToken: formData.get('guestToken'),
    })
    
    // Sign in the user
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validatedFields.email,
      password: validatedFields.password,
    })

    if (error) {
      return {
        error: error.message,
        success: false,
      }
    }

    if (!data.session) {
      return {
        error: 'Failed to create session',
        success: false,
      }
    }

    // BLOCKING MERGE: Wait for cart merge to complete before redirect
    // This ensures guest cart items are reliably merged before user sees their dashboard
    if (data.user && validatedFields.guestToken) {
      try {
        console.log('[Auth] Starting cart merge for user:', data.user.id);
        
        // Wait for merge with 5-second timeout (increased from 1s for reliability)
        const mergeResult = await Promise.race([
          (async () => {
            const serviceClient = await createServiceClient()
            
            // Attempt merge with service role privileges
            const { error } = await serviceClient.rpc('merge_carts_secure', {
              p_user_id: data.user.id,
              p_guest_token: validatedFields.guestToken
            })
            
            if (error) {
              console.error('[Auth] Cart merge RPC error:', error);
              throw error;
            }
            
            console.log('[Auth] Cart merge completed successfully');
            return { success: true };
          })(),
          new Promise<{ success: boolean, timeout?: boolean }>((_, reject) => 
            setTimeout(() => reject(new Error('Cart merge timeout after 5s')), 5000)
          )
        ]);
        
        // Only clear guest token after SUCCESSFUL merge
        if (mergeResult.success) {
          cookieStore.delete('guest_token')
          console.log('[Auth] Guest token cleared after successful merge');
        }
        
      } catch (error) {
        // Log error but don't block login - user can manually refresh their cart
        console.error('[Auth] Cart merge failed, but allowing login to proceed:', error);
        // Guest token kept so user can try merging again if needed
      }
    }

    // Smart redirect based on user role
    revalidatePath('/', 'layout')
    
    // Determine redirect path based on user roles
    const userRoles = data.user?.user_metadata?.user_roles || [];
    let redirectPath = '/';
    
    if (userRoles.includes('admin')) {
      redirectPath = '/admin/dashboard';
    } else if (userRoles.includes('vendor')) {
      redirectPath = '/vendor/dashboard';
    } else if (userRoles.includes('stylist')) {
      redirectPath = '/stylist/dashboard';
    }
    // else: customer goes to home
    
    console.log('[Auth] Redirecting user to:', redirectPath);
    redirect(redirectPath)

  } catch (error) {
    // NEXT_REDIRECT is expected behavior, not an error
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    
    if (error instanceof z.ZodError) {
      return {
        error: error.issues[0].message,
        success: false,
      }
    }

    return {
      error: 'An unexpected error occurred during sign in',
      success: false,
    }
  }
}

export async function signOut() {
  const supabase = await createClient()
  const cookieStore = await cookies()

  try {
    // BEFORE signing out, we need to preserve guest cart items
    // Get current user to check if we have authenticated cart
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      // User is authenticated - convert their cart to guest cart
      const serviceClient = await createServiceClient()
      
      // Generate a new guest token for the cart
      const newGuestToken = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
      
      try {
        // Convert user cart to guest cart in database
        const { error: convertError } = await serviceClient
          .rpc('convert_user_cart_to_guest', {
            p_user_id: user.id,
            p_new_guest_token: newGuestToken
          })
        
        if (!convertError) {
          // Store the new guest token in cookie BEFORE signing out
          // This preserves the cart for the now-guest user
          cookieStore.set({
            name: 'guest_token',
            value: newGuestToken,
            httpOnly: false, // Client needs access
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60 // 30 days
          })
        }
      } catch (convertError) {
        // Log but don't fail - cart conversion is non-critical
        console.error('Failed to convert user cart to guest:', convertError)
      }
    }

    // Now sign out the user
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Sign out error:', error)
      return {
        error: error.message,
        success: false,
      }
    }

    // DO NOT clear guest_token - we just set it!
    // This preserves the cart for the now-guest user

    revalidatePath('/', 'layout')
    redirect('/')

  } catch (error) {
    // NEXT_REDIRECT is expected behavior, not an error
    if (error && typeof error === 'object' && 'digest' in error && 
        typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    
    console.error('Sign out server action error:', error)
    return {
      error: 'An unexpected error occurred during sign out',
      success: false,
    }
  }
}
