#!/usr/bin/env ts-node

/**
 * KB Stylish Database Genesis Script
 * Production-Grade Marketplace Seeding System
 * 
 * Creates a complete product catalog with:
 * - Brands, Categories, Attributes
 * - Products with Variants (Size, Color)
 * - Inventory Management
 * - High-Quality Product Images
 * 
 * Usage: npx ts-node supabase/seed.ts
 */

import { createClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Environment validation
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  console.error('   Please check your .env.local file');
  process.exit(1);
}

// Initialize Supabase Admin Client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Seed Data Definitions
const FASHION_BRANDS = [
  { name: 'Urban Threads', slug: 'urban-threads', description: 'Contemporary streetwear and urban fashion' },
  { name: 'Elegant Essence', slug: 'elegant-essence', description: 'Sophisticated formal wear and business attire' },
  { name: 'Boho Chic', slug: 'boho-chic', description: 'Bohemian and free-spirited fashion' },
  { name: 'Athletic Edge', slug: 'athletic-edge', description: 'Performance sportswear and activewear' },
  { name: 'Vintage Revival', slug: 'vintage-revival', description: 'Retro-inspired and vintage-style clothing' }
];

const CATEGORIES = [
  { name: 'Casual', slug: 'casual', description: 'Comfortable everyday wear' },
  { name: 'Formal', slug: 'formal', description: 'Professional and formal attire' },
  { name: 'Ethnic', slug: 'ethnic', description: 'Traditional and cultural wear' },
  { name: 'Streetwear', slug: 'streetwear', description: 'Urban and street-inspired fashion' },
  { name: 'Activewear', slug: 'activewear', description: 'Sports and fitness clothing' }
];

const PRODUCT_ATTRIBUTES = [
  { name: 'size', display_name: 'Size', type: 'select' },
  { name: 'color', display_name: 'Color', type: 'color' },
  { name: 'material', display_name: 'Material', type: 'text' }
];

const SIZE_VALUES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const COLOR_VALUES = [
  { value: 'black', display: 'Black', hex: '#000000' },
  { value: 'white', display: 'White', hex: '#FFFFFF' },
  { value: 'navy', display: 'Navy Blue', hex: '#1B263B' },
  { value: 'gray', display: 'Gray', hex: '#6C757D' },
  { value: 'red', display: 'Red', hex: '#DC3545' },
  { value: 'blue', display: 'Blue', hex: '#0D6EFD' },
  { value: 'green', display: 'Green', hex: '#198754' },
  { value: 'beige', display: 'Beige', hex: '#F5F5DC' }
];

// Utility Functions
function createSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getRandomPrice(min: number = 25, max: number = 200): number {
  return Math.floor(faker.number.float({ min, max }) / 5) * 5; // Round to nearest 5
}

function generateSKU(productName: string, size: string, color: string): string {
  const prefix = productName.substring(0, 3).toUpperCase();
  const sizeCode = size.substring(0, 2);
  const colorCode = color.substring(0, 2).toUpperCase();
  const random = faker.string.alphanumeric(3).toUpperCase();
  return `${prefix}-${sizeCode}-${colorCode}-${random}`;
}

// Logging Helper
function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`);
}

// Seeding Functions
async function seedBrands() {
  log('🏷️', 'Seeding brands...');
  
  // Check if brands already exist
  const { data: existingBrands } = await supabase
    .from('brands')
    .select('id, name, slug');
    
  if (existingBrands && existingBrands.length > 0) {
    log('✅', `Using existing ${existingBrands.length} brands`);
    return existingBrands;
  }
  
  const { data, error } = await supabase
    .from('brands')
    .insert(FASHION_BRANDS.map(brand => ({
      ...brand,
      logo_url: `https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=200&h=200&fit=crop&crop=center`,
      website_url: `https://${brand.slug}.com`,
      is_active: true
    })))
    .select('id, name, slug');

  if (error) throw error;
  log('✅', `Created ${data?.length} brands`);
  return data;
}

async function seedCategories() {
  log('📁', 'Seeding categories...');
  
  // Check if categories already exist
  const { data: existingCategories } = await supabase
    .from('categories')
    .select('id, name, slug');
    
  if (existingCategories && existingCategories.length > 0) {
    log('✅', `Using existing ${existingCategories.length} categories`);
    return existingCategories;
  }
  
  const { data, error } = await supabase
    .from('categories')
    .insert(CATEGORIES.map((category, index) => ({
      ...category,
      image_url: `https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop&crop=center`,
      sort_order: index,
      is_active: true
    })))
    .select('id, name, slug');

  if (error) throw error;
  log('✅', `Created ${data?.length} categories`);
  return data;
}

async function seedProductAttributes() {
  log('🔧', 'Seeding product attributes...');
  
  // Check if attributes already exist
  let { data: attributes } = await supabase
    .from('product_attributes')
    .select('id, name');
    
  if (!attributes || attributes.length === 0) {
    // Create attributes if they don't exist
    const { data: newAttributes, error: attrError } = await supabase
      .from('product_attributes')
      .insert(PRODUCT_ATTRIBUTES.map((attr, index) => ({
        name: attr.name,
        display_name: attr.display_name,
        attribute_type: attr.type,
        is_variant_defining: true,
        sort_order: index,
        is_active: true
      })))
      .select('id, name');

    if (attrError) throw attrError;
    attributes = newAttributes;
  }

  // Check if attribute values already exist
  let { data: values } = await supabase
    .from('attribute_values')
    .select('id, attribute_id, value, display_value');
    
  if (!values || values.length === 0) {
    // Create attribute values
    const attributeValues = [];
    
    for (const attr of attributes!) {
      if (attr.name === 'size') {
        for (const [index, size] of SIZE_VALUES.entries()) {
          attributeValues.push({
            attribute_id: attr.id,
            value: size.toLowerCase(),
            display_value: size,
            sort_order: index,
            is_active: true
          });
        }
      } else if (attr.name === 'color') {
        for (const [index, color] of COLOR_VALUES.entries()) {
          attributeValues.push({
            attribute_id: attr.id,
            value: color.value,
            display_value: color.display,
            color_hex: color.hex,
            sort_order: index,
            is_active: true
          });
        }
      }
    }

    const { data: newValues, error: valError } = await supabase
      .from('attribute_values')
      .insert(attributeValues)
      .select('id, attribute_id, value, display_value');

    if (valError) throw valError;
    values = newValues;
  }
  
  log('✅', `Created ${attributes?.length} attributes with ${values?.length} values`);
  return { attributes, values };
}

async function getOrCreateTestVendor() {
  log('👤', 'Setting up test vendor...');
  
  // Use any existing user as the vendor
  const { data: vendor, error } = await supabase
    .from('user_profiles')
    .select('id, display_name')
    .limit(1)
    .single();

  if (error) throw error;
  
  log('✅', `Using existing user "${vendor.display_name}" as vendor`);
  return vendor;
}

async function seedProducts(brands: any[], categories: any[], vendor: any, attributeData: any) {
  log('👕', 'Seeding products with variants...');

  const { attributes, values } = attributeData;
  
  // Find size and color attributes
  const sizeAttr = attributes.find((a: any) => a.name === 'size');
  const colorAttr = attributes.find((a: any) => a.name === 'color');
  
  const sizeValues = values.filter((v: any) => v.attribute_id === sizeAttr?.id);
  const colorValues = values.filter((v: any) => v.attribute_id === colorAttr?.id);

  const productData = [
    {
      name: 'Premium Cotton T-Shirt',
      category: 'casual',
      brand: 'urban-threads',
      description: 'Soft, breathable cotton t-shirt perfect for everyday wear. Features a comfortable fit and durable construction.',
      material: '100% Premium Cotton',
      colors: ['black', 'white', 'navy', 'gray'],
      basePrice: 35
    },
    {
      name: 'Slim Fit Jeans',
      category: 'casual',
      brand: 'urban-threads',
      description: 'Classic slim-fit denim jeans with stretch comfort. Perfect for both casual and smart-casual occasions.',
      material: '98% Cotton, 2% Elastane',
      colors: ['blue', 'black'],
      basePrice: 85
    },
    {
      name: 'Business Blazer',
      category: 'formal',
      brand: 'elegant-essence',
      description: 'Professional tailored blazer suitable for office wear and formal occasions. Features structured shoulders and a refined cut.',
      material: '70% Wool, 30% Polyester',
      colors: ['black', 'navy', 'gray'],
      basePrice: 160
    },
    {
      name: 'Floral Maxi Dress',
      category: 'casual',
      brand: 'boho-chic',
      description: 'Elegant flowing maxi dress with beautiful floral print. Perfect for summer occasions and weekend outings.',
      material: '100% Rayon',
      colors: ['red', 'blue', 'green'],
      basePrice: 75
    },
    {
      name: 'Athletic Joggers',
      category: 'activewear',
      brand: 'athletic-edge',
      description: 'Comfortable performance joggers with moisture-wicking technology. Ideal for workouts and athleisure wear.',
      material: '88% Polyester, 12% Spandex',
      colors: ['black', 'gray', 'navy'],
      basePrice: 55
    },
    {
      name: 'Vintage Leather Jacket',
      category: 'streetwear',
      brand: 'vintage-revival',
      description: 'Classic leather jacket with vintage-inspired design. Features premium leather construction and timeless styling.',
      material: '100% Genuine Leather',
      colors: ['black'],
      basePrice: 185
    },
    {
      name: 'Silk Blouse',
      category: 'formal',
      brand: 'elegant-essence',
      description: 'Luxurious silk blouse with elegant draping. Perfect for professional settings and formal events.',
      material: '100% Mulberry Silk',
      colors: ['white', 'beige', 'navy'],
      basePrice: 120
    },
    {
      name: 'Cargo Shorts',
      category: 'casual',
      brand: 'urban-threads',
      description: 'Functional cargo shorts with multiple pockets. Made from durable cotton blend for all-day comfort.',
      material: '65% Cotton, 35% Polyester',
      colors: ['beige', 'gray', 'green'],
      basePrice: 45
    }
  ];

  const createdProducts = [];

  for (const productInfo of productData) {
    // Find brand and category
    const brand = brands.find(b => b.slug === productInfo.brand);
    const category = categories.find(c => c.slug === productInfo.category);

    if (!brand || !category) {
      log('⚠️', `Skipping ${productInfo.name} - missing brand or category`);
      continue;
    }

    // Create base product
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        vendor_id: vendor.id,
        brand_id: brand.id,
        category_id: category.id,
        name: productInfo.name,
        slug: createSlug(productInfo.name),
        description: productInfo.description,
        short_description: productInfo.description.substring(0, 100) + '...',
        material: productInfo.material,
        care_instructions: 'Machine wash cold, tumble dry low',
        country_of_origin: 'Nepal',
        is_active: true,
        is_featured: faker.datatype.boolean(0.3), // 30% chance of being featured
        seo_title: `${productInfo.name} - KB Stylish`,
        seo_description: productInfo.description.substring(0, 150)
      })
      .select('id, name, slug')
      .single();

    if (productError) {
      log('❌', `Error creating product ${productInfo.name}: ${productError.message}`);
      continue;
    }

    // Create product images
    const imageUrls = [
      `https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&h=600&fit=crop&crop=center`,
      `https://images.unsplash.com/photo-1503341338985-b019d1da39ec?w=500&h=600&fit=crop&crop=center`,
      `https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=500&h=600&fit=crop&crop=center`
    ];

    const productImages = imageUrls.map((url, index) => ({
      product_id: product.id,
      image_url: url,
      alt_text: `${product.name} - Image ${index + 1}`,
      sort_order: index,
      is_primary: index === 0
    }));

    await supabase.from('product_images').insert(productImages);

    // Create variants for each size-color combination
    const variants = [];
    for (const colorValue of productInfo.colors) {
      const color = colorValues.find((c: any) => c.value === colorValue);
      if (!color) continue;

      for (const sizeValue of sizeValues.slice(0, 4)) { // Use first 4 sizes
        const price = productInfo.basePrice + faker.number.int({ min: -10, max: 25 });
        const comparePrice = faker.datatype.boolean(0.3) ? price + faker.number.int({ min: 10, max: 30 }) : null;

        variants.push({
          product_id: product.id,
          sku: generateSKU(product.name, sizeValue.value, color.value),
          price: price,
          compare_at_price: comparePrice,
          cost_price: Math.floor(price * 0.6), // 40% markup
          weight_grams: faker.number.int({ min: 200, max: 800 }),
          is_active: true,
          size_value_id: sizeValue.id,
          color_value_id: color.id
        });
      }
    }

    // Insert variants
    const { data: createdVariants, error: variantError } = await supabase
      .from('product_variants')
      .insert(variants.map(v => ({
        product_id: v.product_id,
        sku: v.sku,
        price: v.price,
        compare_at_price: v.compare_at_price,
        cost_price: v.cost_price,
        weight_grams: v.weight_grams,
        is_active: v.is_active
      })))
      .select('id, sku');

    if (variantError) {
      log('❌', `Error creating variants for ${product.name}: ${variantError.message}`);
      continue;
    }

    // Link variants to attribute values
    const variantAttributeLinks = [];
    for (let i = 0; i < createdVariants!.length; i++) {
      const variant = createdVariants![i];
      const variantData = variants[i];
      
      variantAttributeLinks.push(
        { variant_id: variant.id, attribute_value_id: variantData.size_value_id },
        { variant_id: variant.id, attribute_value_id: variantData.color_value_id }
      );
    }

    await supabase.from('variant_attribute_values').insert(variantAttributeLinks);

    // Create inventory location for vendor
    let { data: location } = await supabase
      .from('inventory_locations')
      .select('id')
      .eq('vendor_id', vendor.id)
      .eq('is_default', true)
      .single();

    if (!location) {
      const { data: newLocation } = await supabase
        .from('inventory_locations')
        .insert({
          vendor_id: vendor.id,
          name: 'Main Warehouse',
          address: 'Kathmandu, Nepal',
          is_default: true,
          is_active: true
        })
        .select('id')
        .single();
      location = newLocation;
    }

    // Create inventory records
    const inventoryRecords = createdVariants!.map(variant => ({
      variant_id: variant.id,
      location_id: location!.id,
      quantity_available: faker.number.int({ min: 5, max: 50 }),
      quantity_reserved: 0,
      quantity_incoming: 0,
      reorder_point: 5,
      reorder_quantity: 20
    }));

    await supabase.from('inventory').insert(inventoryRecords);

    createdProducts.push({
      ...product,
      variants: createdVariants!.length
    });

    log('✅', `Created ${product.name} with ${createdVariants!.length} variants`);
  }

  return createdProducts;
}

// Main Execution
async function runSeed() {
  try {
    log('🚀', 'Starting KB Stylish Database Genesis...');
    log('🌍', `Connected to: ${SUPABASE_URL}`);

    // Check if database is already seeded
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    if (productCount && productCount > 0) {
      log('⚠️', `Database already contains ${productCount} products. Skipping seed...`);
      log('💡', 'To re-seed, please clear the database first');
      return;
    }

    const brands = await seedBrands();
    const categories = await seedCategories();
    const attributeData = await seedProductAttributes();
    const vendor = await getOrCreateTestVendor();
    const products = await seedProducts(brands, categories, vendor, attributeData);

    log('🎉', 'Database seeding completed successfully!');
    log('📊', `Summary:`);
    log('  ', `• ${brands.length} brands created`);
    log('  ', `• ${categories.length} categories created`);
    log('  ', `• ${attributeData.attributes.length} product attributes with ${attributeData.values.length} values`);
    log('  ', `• ${products.length} products created`);
    log('  ', `• ${products.reduce((sum, p) => sum + p.variants, 0)} product variants created`);
    log('🛍️', 'Your KB Stylish marketplace is ready for business!');

  } catch (error) {
    log('❌', `Seeding failed: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  runSeed();
}

export { runSeed };
