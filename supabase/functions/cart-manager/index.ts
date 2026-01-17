import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders } from './_shared/cors.ts';
// Secure session management for guest carts
const GUEST_SESSION_COOKIE = 'guest_token';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
Deno.serve(async (req)=>{
  // CRITICAL FIX: Get origin from request for dynamic CORS
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  // Variables for error context
  let requestData;
  let authenticatedUser = null;
  let guestToken = null;
  try {
    // Dual client pattern - CORRECTLY IMPLEMENTED
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') ?? ''
        }
      }
    });
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    // RESTORATION: Enhanced auth verification with resilient fallback
    const authHeader = req.headers.get('Authorization');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring('Bearer '.length);
      if (token === anonKey) {
        console.log('[Edge Function] Using anon key for guest access');
        authenticatedUser = null;
      } else {
        const { data: { user }, error } = await userClient.auth.getUser(token);
        if (!error && user) {
          authenticatedUser = {
            id: user.id,
            email: user.email ?? undefined
          };
          console.log('[Edge Function] Authenticated user:', user.id);
        } else {
          console.error('[Edge Function] JWT verification failed:', error?.message || 'Unknown error');
          const looksLikeJWT = token.split('.').length === 3;
          if (looksLikeJWT && token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
            console.warn('[Edge Function] Proceeding as guest with fallback token');
            authenticatedUser = null;
          }
        }
      }
    }
    // Read guest token from x-guest-token header
    if (!authenticatedUser) {
      const headerToken = req.headers.get('x-guest-token');
      if (headerToken) {
        guestToken = headerToken;
        console.log('[Edge Function] Using guest token from header:', guestToken);
      }
    }
    // Parse request
    requestData = await req.json();
    const { action, variant_id, quantity, merge_guest_cart, combo_id, combo_group_id } = requestData;
    if (!action) {
      return new Response(JSON.stringify({
        error: 'Action is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!authenticatedUser && !guestToken) {
      console.error('[Edge Function] No auth or guest token provided');
      return new Response(JSON.stringify({
        error: 'Authentication or session required'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    let response;
    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': 'application/json'
    };
    console.log('[Edge Function] Processing:', {
      action,
      hasAuth: !!authenticatedUser,
      hasGuestToken: !!guestToken,
      variant_id
    });
    // Route to appropriate handler
    switch(action){
      case 'get':
        response = await getCart(serviceClient, authenticatedUser, guestToken);
        break;
      case 'add':
        if (!variant_id || !quantity) {
          return new Response(JSON.stringify({
            error: 'variant_id and quantity are required for add action'
          }), {
            status: 400,
            headers: responseHeaders
          });
        }
        response = await addToCart(serviceClient, authenticatedUser, guestToken, variant_id, quantity);
        break;
      case 'update':
        if (!variant_id || quantity === undefined) {
          return new Response(JSON.stringify({
            error: 'variant_id and quantity are required for update action'
          }), {
            status: 400,
            headers: responseHeaders
          });
        }
        response = await updateCartItem(serviceClient, authenticatedUser, guestToken, variant_id, quantity);
        break;
      case 'remove':
        if (!variant_id) {
          return new Response(JSON.stringify({
            error: 'variant_id is required for remove action'
          }), {
            status: 400,
            headers: responseHeaders
          });
        }
        response = await removeFromCart(serviceClient, authenticatedUser, guestToken, variant_id);
        break;
      case 'clear':
        response = await clearCart(serviceClient, authenticatedUser, guestToken);
        break;
      case 'merge':
        if (!authenticatedUser) {
          return new Response(JSON.stringify({
            error: 'Authentication required for cart merge'
          }), {
            status: 401,
            headers: responseHeaders
          });
        }
        if (!merge_guest_cart) {
          return new Response(JSON.stringify({
            error: 'merge_guest_cart flag is required for merge action'
          }), {
            status: 400,
            headers: responseHeaders
          });
        }
        response = await mergeGuestCart(serviceClient, authenticatedUser, guestToken);
        break;
      case 'add_combo':
        if (!combo_id) {
          return new Response(JSON.stringify({
            error: 'combo_id is required for add_combo action'
          }), {
            status: 400,
            headers: responseHeaders
          });
        }
        response = await addComboToCart(serviceClient, authenticatedUser, guestToken, combo_id);
        break;
      case 'remove_combo':
        if (!combo_group_id) {
          return new Response(JSON.stringify({
            error: 'combo_group_id is required for remove_combo action'
          }), {
            status: 400,
            headers: responseHeaders
          });
        }
        response = await removeComboFromCart(serviceClient, authenticatedUser, guestToken, combo_group_id);
        break;
      case 'update_combo_quantity':
        if (!combo_group_id || quantity === undefined) {
          return new Response(JSON.stringify({
            error: 'combo_group_id and quantity are required for update_combo_quantity action'
          }), {
            status: 400,
            headers: responseHeaders
          });
        }
        response = await updateComboQuantity(serviceClient, authenticatedUser, guestToken, combo_group_id, quantity);
        break;
      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`
        }), {
          status: 400,
          headers: responseHeaders
        });
    }
    return new Response(JSON.stringify(response), {
      status: response.success ? 200 : 400,
      headers: responseHeaders
    });
  } catch (error) {
    const errorContext = {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      request: {
        action: requestData?.action,
        hasAuth: !!authenticatedUser,
        hasGuestToken: !!guestToken,
        url: req.url,
        method: req.method
      }
    };
    console.error('Cart manager error:', JSON.stringify(errorContext));
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'An error occurred processing your request'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
// Get cart with items
async function getCart(supabase, authenticatedUser, guestToken) {
  try {
    const getPayload = {};
    if (authenticatedUser?.id) getPayload.p_user_id = authenticatedUser.id;
    else getPayload.p_guest_token = guestToken;
    const { data: cartJson, error: cartError } = await supabase.rpc('get_cart_details_secure', getPayload);
    if (cartError) {
      console.error('Failed to get cart:', cartError);
      return {
        success: false,
        message: 'Failed to get cart'
      };
    }
    const cart = cartJson;
    const items = cart?.items ?? [];
    
    // 🔍 DEBUG: Log cart items to see what database returns
    console.log('[Edge Function] Cart items from database:', JSON.stringify(items, null, 2));
    
    const warnings = [];
    for (const item of items){
      if (item.price_snapshot != null && item.current_price != null && item.price_snapshot !== item.current_price && item.product?.name) {
        warnings.push(`Price changed for ${item.product.name}`);
      }
    }
    return {
      success: true,
      cart: {
        ...cart,
        cart_items: items
      },
      warnings: warnings.length > 0 ? warnings : undefined
    };
  } catch (error) {
    console.error('Error getting cart:', error);
    return {
      success: false,
      message: 'Failed to get cart'
    };
  }
}
// RESTORATION: Add item to cart and return full cart
async function addToCart(supabase, authenticatedUser, guestToken, variant_id, quantity) {
  try {
    // Step 1: Add the item
    const addPayload = {
      p_variant_id: variant_id,
      p_quantity: quantity
    };
    if (authenticatedUser?.id) addPayload.p_user_id = authenticatedUser.id;
    else addPayload.p_guest_token = guestToken;
    console.log('[Edge Function] Calling add_to_cart_secure with:', addPayload);
    const { data, error } = await supabase.rpc('add_to_cart_secure', addPayload);
    if (error) {
      console.error('RPC error in add_to_cart_secure:', JSON.stringify({
        error,
        payload: addPayload
      }));
      return {
        success: false,
        message: `Failed to add item to cart: ${error.message}`
      };
    }
    // Step 2: CONTRACT ALIGNMENT - Return the full updated cart
    const cartResponse = await getCart(supabase, authenticatedUser, guestToken);
    if (cartResponse.success) {
      return {
        success: true,
        cart: cartResponse.cart,
        message: 'Item added to cart successfully',
        warnings: cartResponse.warnings
      };
    } else {
      return {
        success: false,
        message: 'Item added but failed to retrieve updated cart'
      };
    }
  } catch (error) {
    console.error('Error adding to cart:', error);
    return {
      success: false,
      message: 'Failed to add item to cart'
    };
  }
}
// RESTORATION: Update cart item quantity and return full cart
async function updateCartItem(supabase, authenticatedUser, guestToken, variant_id, quantity) {
  try {
    // Step 1: Update the item
    const updPayload = {
      p_variant_id: variant_id,
      p_quantity: quantity
    };
    if (authenticatedUser?.id) updPayload.p_user_id = authenticatedUser.id;
    else updPayload.p_guest_token = guestToken;
    const { data, error } = await supabase.rpc('update_cart_item_secure', updPayload);
    if (error) {
      return {
        success: false,
        message: 'Failed to update cart item'
      };
    }
    // Step 2: CONTRACT ALIGNMENT - Return the full updated cart
    const cartResponse = await getCart(supabase, authenticatedUser, guestToken);
    if (cartResponse.success) {
      return {
        success: true,
        cart: cartResponse.cart,
        message: 'Cart item updated successfully',
        warnings: cartResponse.warnings
      };
    } else {
      return {
        success: false,
        message: 'Item updated but failed to retrieve updated cart'
      };
    }
  } catch (error) {
    console.error('Error updating cart item:', error);
    return {
      success: false,
      message: 'Failed to update cart item'
    };
  }
}
// RESTORATION: Remove item from cart and return full cart
async function removeFromCart(supabase, authenticatedUser, guestToken, variant_id) {
  try {
    // Step 1: Remove the item
    const remPayload = {
      p_variant_id: variant_id
    };
    if (authenticatedUser?.id) remPayload.p_user_id = authenticatedUser.id;
    else remPayload.p_guest_token = guestToken;
    const { data, error } = await supabase.rpc('remove_item_secure', remPayload);
    if (error) {
      return {
        success: false,
        message: 'Failed to remove item from cart'
      };
    }
    // Step 2: CONTRACT ALIGNMENT - Return the full updated cart
    const cartResponse = await getCart(supabase, authenticatedUser, guestToken);
    if (cartResponse.success) {
      return {
        success: true,
        cart: cartResponse.cart,
        message: 'Item removed from cart successfully',
        warnings: cartResponse.warnings
      };
    } else {
      return {
        success: false,
        message: 'Item removed but failed to retrieve updated cart'
      };
    }
  } catch (error) {
    console.error('Error removing from cart:', error);
    return {
      success: false,
      message: 'Failed to remove item from cart'
    };
  }
}
// RESTORATION: Clear entire cart and return empty cart structure
async function clearCart(supabase, authenticatedUser, guestToken) {
  try {
    // Step 1: Clear the cart
    const clrPayload = {};
    if (authenticatedUser?.id) clrPayload.p_user_id = authenticatedUser.id;
    else clrPayload.p_guest_token = guestToken;
    const { data, error } = await supabase.rpc('clear_cart_secure', clrPayload);
    if (error) {
      return {
        success: false,
        message: 'Failed to clear cart'
      };
    }
    // Step 2: CONTRACT ALIGNMENT - Return the empty cart structure
    const cartResponse = await getCart(supabase, authenticatedUser, guestToken);
    if (cartResponse.success) {
      return {
        success: true,
        cart: cartResponse.cart,
        message: 'Cart cleared successfully'
      };
    } else {
      // Even if fetch fails, cart is cleared
      return {
        success: true,
        cart: {
          id: null,
          items: [],
          cart_items: [],
          item_count: 0,
          subtotal: 0
        },
        message: 'Cart cleared successfully'
      };
    }
  } catch (error) {
    console.error('Error clearing cart:', error);
    return {
      success: false,
      message: 'Failed to clear cart'
    };
  }
}
// Merge guest cart into user cart
async function mergeGuestCart(supabase, authenticatedUser, guestToken) {
  try {
    if (!guestToken) {
      return {
        success: true,
        message: 'No guest cart to merge'
      };
    }
    const { data: mergeResult, error: mergeError } = await supabase.rpc('merge_carts_secure', {
      p_user_id: authenticatedUser.id,
      p_guest_token: guestToken
    });
    if (mergeError) {
      console.error('Merge error:', mergeError);
      return {
        success: false,
        message: 'Failed to merge carts'
      };
    }
    if (!mergeResult.success) {
      return {
        success: false,
        message: 'Cart merge failed'
      };
    }
    const warnings = [];
    if (mergeResult.merged_items > 0) {
      warnings.push(`${mergeResult.merged_items} items merged into your cart`);
    }
    if (mergeResult.clamped_items > 0) {
      warnings.push(`${mergeResult.clamped_items} items had quantities adjusted due to stock limits`);
    }
    // Get the updated cart
    const cartResponse = await getCart(supabase, authenticatedUser, null);
    return {
      success: true,
      cart: cartResponse.cart,
      message: 'Carts merged successfully',
      warnings: warnings.length > 0 ? warnings : undefined
    };
  } catch (error) {
    console.error('Error merging carts:', error);
    return {
      success: false,
      message: 'Failed to merge carts'
    };
  }
}


// ============================================================================
// COMBO PRODUCTS - Cart Operations
// ============================================================================

// Add combo to cart (expands into constituent items)
async function addComboToCart(supabase, authenticatedUser, guestToken, combo_id: string) {
  try {
    const addPayload: Record<string, unknown> = {
      p_combo_id: combo_id
    };
    if (authenticatedUser?.id) addPayload.p_user_id = authenticatedUser.id;
    else addPayload.p_guest_token = guestToken;

    console.log('[Edge Function] Calling add_combo_to_cart_secure with:', addPayload);
    const { data, error } = await supabase.rpc('add_combo_to_cart_secure', addPayload);

    if (error) {
      console.error('RPC error in add_combo_to_cart_secure:', JSON.stringify({
        error,
        payload: addPayload
      }));
      return {
        success: false,
        message: `Failed to add combo to cart: ${error.message}`
      };
    }

    // Check if the RPC returned an error
    if (data && !data.success) {
      return {
        success: false,
        message: data.message || 'Failed to add combo to cart'
      };
    }

    // Return the full updated cart
    const cartResponse = await getCart(supabase, authenticatedUser, guestToken);
    if (cartResponse.success) {
      return {
        success: true,
        cart: cartResponse.cart,
        combo_group_id: data?.combo_group_id,
        message: 'Combo added to cart successfully',
        warnings: cartResponse.warnings
      };
    } else {
      return {
        success: false,
        message: 'Combo added but failed to retrieve updated cart'
      };
    }
  } catch (error) {
    console.error('Error adding combo to cart:', error);
    return {
      success: false,
      message: 'Failed to add combo to cart'
    };
  }
}

// Remove combo from cart (removes all items in the combo group)
async function removeComboFromCart(supabase, authenticatedUser, guestToken, combo_group_id: string) {
  try {
    const removePayload: Record<string, unknown> = {
      p_combo_group_id: combo_group_id
    };
    if (authenticatedUser?.id) removePayload.p_user_id = authenticatedUser.id;
    else removePayload.p_guest_token = guestToken;

    console.log('[Edge Function] Calling remove_combo_from_cart_secure with:', removePayload);
    const { data, error } = await supabase.rpc('remove_combo_from_cart_secure', removePayload);

    if (error) {
      console.error('RPC error in remove_combo_from_cart_secure:', JSON.stringify({
        error,
        payload: removePayload
      }));
      return {
        success: false,
        message: `Failed to remove combo from cart: ${error.message}`
      };
    }

    // Check if the RPC returned an error
    if (data && !data.success) {
      return {
        success: false,
        message: data.message || 'Failed to remove combo from cart'
      };
    }

    // Return the full updated cart
    const cartResponse = await getCart(supabase, authenticatedUser, guestToken);
    if (cartResponse.success) {
      return {
        success: true,
        cart: cartResponse.cart,
        message: 'Combo removed from cart successfully',
        warnings: cartResponse.warnings
      };
    } else {
      return {
        success: true,
        cart: {
          id: null,
          items: [],
          cart_items: [],
          item_count: 0,
          subtotal: 0
        },
        message: 'Combo removed from cart successfully'
      };
    }
  } catch (error) {
    console.error('Error removing combo from cart:', error);
    return {
      success: false,
      message: 'Failed to remove combo from cart'
    };
  }
}


// Update combo quantity (updates all items in combo proportionally)
async function updateComboQuantity(supabase, authenticatedUser, guestToken, combo_group_id: string, quantity: number) {
  try {
    const updatePayload: Record<string, unknown> = {
      p_combo_group_id: combo_group_id,
      p_new_quantity: quantity
    };
    if (authenticatedUser?.id) updatePayload.p_user_id = authenticatedUser.id;
    else updatePayload.p_guest_token = guestToken;

    console.log('[Edge Function] Calling update_combo_quantity_secure with:', updatePayload);
    const { data, error } = await supabase.rpc('update_combo_quantity_secure', updatePayload);

    if (error) {
      console.error('RPC error in update_combo_quantity_secure:', JSON.stringify({
        error,
        payload: updatePayload
      }));
      return {
        success: false,
        message: `Failed to update combo quantity: ${error.message}`
      };
    }

    // Check if the RPC returned an error
    if (data && !data.success) {
      return {
        success: false,
        message: data.message || 'Failed to update combo quantity'
      };
    }

    // Return the full updated cart
    const cartResponse = await getCart(supabase, authenticatedUser, guestToken);
    if (cartResponse.success) {
      return {
        success: true,
        cart: cartResponse.cart,
        message: 'Combo quantity updated successfully',
        warnings: cartResponse.warnings
      };
    } else {
      return {
        success: false,
        message: 'Combo quantity updated but failed to retrieve updated cart'
      };
    }
  } catch (error) {
    console.error('Error updating combo quantity:', error);
    return {
      success: false,
      message: 'Failed to update combo quantity'
    };
  }
}
