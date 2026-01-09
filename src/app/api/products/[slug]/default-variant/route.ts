import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/products/[slug]/default-variant
 * Returns the default variant ID for a product (first available variant with stock)
 * Used by MarketplaceProductCard for quick add-to-cart functionality
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const cookieStore = await cookies();
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore - called from Server Component
            }
          },
        },
      }
    );

    // First, get the product by slug
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, price')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Get variants for this product, preferring ones with stock
    const { data: variants, error: variantsError } = await supabase
      .from('product_variants')
      .select(`
        id,
        sku,
        price,
        attributes,
        inventory (
          quantity_available
        )
      `)
      .eq('product_id', product.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (variantsError) {
      console.error('Error fetching variants:', variantsError);
      return NextResponse.json(
        { error: 'Failed to fetch variants' },
        { status: 500 }
      );
    }

    // Find the first variant with stock, or just the first variant
    let defaultVariant = variants?.find((v: any) => {
      const stock = v.inventory?.[0]?.quantity_available || 0;
      return stock > 0;
    });

    // If no variant with stock, use the first variant
    if (!defaultVariant && variants && variants.length > 0) {
      defaultVariant = variants[0];
    }

    if (!defaultVariant) {
      return NextResponse.json(
        { error: 'No variants available for this product' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      variantId: defaultVariant.id,
      productId: product.id,
      productName: product.name,
      price: defaultVariant.price || product.price,
      sku: defaultVariant.sku,
      attributes: defaultVariant.attributes,
      stock: defaultVariant.inventory?.[0]?.quantity_available || 0,
    });
  } catch (error) {
    console.error('Default variant API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
