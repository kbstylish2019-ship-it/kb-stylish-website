/**
 * Mock implementation of CartAPIClient for testing
 */

export interface CartResponse {
  success: boolean;
  cart?: {
    id: string;
    user_id: string | null;
    guest_session?: string;
    created_at: string;
    updated_at: string;
    items: CartItem[];
    total_items: number;
    total_amount: number;
  };
  guest_token?: string;
  error?: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  price_snapshot: number;
  added_at: string;
  product_name: string;
  product_slug: string;
  variant_sku: string;
  product_image?: string;
}

export interface PaymentIntentResponse {
  success: boolean;
  payment_intent_id?: string;
  client_secret?: string;
  amount_cents?: number;
  expires_at?: string;
  error?: string;
  details?: string[];
}

export interface ShippingAddress {
  name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export class CartAPIClient {
  async getCart(): Promise<CartResponse> {
    return { success: true, cart: undefined };
  }
  
  async addToCart(variantId: string, quantity: number = 1): Promise<CartResponse> {
    return { success: true, cart: undefined };
  }
  
  async updateCartItem(itemId: string, quantity: number): Promise<CartResponse> {
    return { success: true, cart: undefined };
  }
  
  async removeFromCart(itemId: string): Promise<CartResponse> {
    return { success: true, cart: undefined };
  }
  
  async clearCart(): Promise<CartResponse> {
    return { success: true, cart: undefined };
  }
  
  async createOrderIntent(shippingAddress: ShippingAddress): Promise<PaymentIntentResponse> {
    return { success: true };
  }
  
  async mergeCart(): Promise<CartResponse> {
    return { success: true, cart: undefined };
  }
}

export const cartAPI = new CartAPIClient();
