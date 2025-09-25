/**
 * Comprehensive test suite for apiClient.ts
 * Tests the real Supabase integration with proper mocking
 */

import { 
  fetchProducts, 
  fetchProductBySlug, 
  getProductCategories,
  fetchActiveStylistsWithServices,
  fetchAvailableSlots,
  createBooking
} from '../apiClient';
import type { ProductFilters, ProductSort } from '../apiClient';

// Mock Supabase client with proper typing
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockReturnThis(),
  auth: {
    getUser: jest.fn()
  }
} as any;

// Mock next/headers to avoid cookies error
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: jest.fn(() => []),
    setAll: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// Mock @supabase/ssr
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => mockSupabaseClient),
}));

// Mock Redis client
jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  })),
}));

// Mock Next.js cache
jest.mock('next/cache', () => ({
  unstable_noStore: jest.fn(),
}));

// Mock the rpc function for fetchProductBySlug
const mockRpc = jest.fn().mockReturnThis();
mockSupabaseClient.rpc = mockRpc;

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock chain
    mockSupabaseClient.from.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.eq.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.or.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.in.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.gte.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.lte.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.order.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.gt.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.limit.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.single.mockReturnValue(mockSupabaseClient);
  });

  describe('fetchProducts', () => {
    const mockProductData = [
      {
        id: 'prod-1',
        name: 'Test Product 1',
        slug: 'test-product-1',
        description: 'A test product',
        is_featured: true,
        created_at: '2024-01-01T00:00:00Z',
        categories: { id: 'cat-1', name: 'Test Category', slug: 'test-category' },
        product_variants: [
          { id: 'var-1', price: 1000, inventory: [{ quantity_available: 10 }] },
          { id: 'var-2', price: 1500, inventory: [{ quantity_available: 5 }] }
        ],
        product_images: [
          { image_url: 'https://example.com/image1.jpg', sort_order: 1 },
          { image_url: 'https://example.com/image2.jpg', sort_order: 2 }
        ],
        user_profiles: [{ id: 'vendor-1', display_name: 'Test Vendor' }]
      }
    ];

    it('should fetch products with basic parameters', async () => {
      mockSupabaseClient.limit.mockResolvedValue({
        data: mockProductData,
        error: null,
        count: 1
      });

      const result = await fetchProducts();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('products');
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_active', true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('prod-1');
      expect(result.data[0].name).toBe('Test Product 1');
      expect(result.data[0].price).toBe(1000);
      expect(result.data[0].badge).toBe('Featured');
    });

    it('should apply search filter correctly', async () => {
      mockSupabaseClient.limit.mockResolvedValue({
        data: mockProductData,
        error: null,
        count: 1
      });

      const filters: ProductFilters = { search: 'test product' };
      await fetchProducts({ filters });

      expect(mockSupabaseClient.or).toHaveBeenCalledWith(
        'name.ilike.%test product%,description.ilike.%test product%'
      );
    });

    it('should apply category filter correctly', async () => {
      mockSupabaseClient.limit.mockResolvedValue({
        data: mockProductData,
        error: null,
        count: 1
      });

      const filters: ProductFilters = { categories: ['category1', 'category2'] };
      await fetchProducts({ filters });

      expect(mockSupabaseClient.in).toHaveBeenCalledWith('categories.slug', ['category1', 'category2']);
    });

    it('should apply price filters correctly', async () => {
      mockSupabaseClient.limit.mockResolvedValue({
        data: mockProductData,
        error: null,
        count: 1
      });

      const filters: ProductFilters = { minPrice: 500, maxPrice: 2000 };
      const result = await fetchProducts({ filters });

      // Price filtering is done post-query, so we check the result
      expect(result.data[0].price).toBeGreaterThanOrEqual(500);
      expect(result.data[0].price).toBeLessThanOrEqual(2000);
    });

    it('should apply sorting correctly', async () => {
      mockSupabaseClient.limit.mockResolvedValue({
        data: mockProductData,
        error: null,
        count: 1
      });

      const sort: ProductSort = { field: 'created_at', order: 'desc' };
      await fetchProducts({ sort });

      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should apply pagination correctly', async () => {
      mockSupabaseClient.limit.mockResolvedValue({
        data: mockProductData,
        error: null,
        count: 1
      });

      const pagination = { cursor: 'cursor-123', limit: 24 };
      await fetchProducts({ pagination });

      expect(mockSupabaseClient.gt).toHaveBeenCalledWith('id', 'cursor-123');
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(48); // limit * 2 for price filtering
    });

    it('should handle price sorting correctly', async () => {
      const multiProductData = [
        { ...mockProductData[0], product_variants: [{ price: 2000 }] },
        { ...mockProductData[0], id: 'prod-2', product_variants: [{ price: 1000 }] }
      ];

      mockSupabaseClient.limit.mockResolvedValue({
        data: multiProductData,
        error: null,
        count: 2
      });

      const sort: ProductSort = { field: 'price', order: 'asc' };
      const result = await fetchProducts({ sort });

      expect(result.data[0].price).toBeLessThanOrEqual(result.data[1].price);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabaseClient.limit.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
        count: 0
      });

      const result = await fetchProducts();

      // Should fallback to mock data
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should calculate stock status correctly', async () => {
      const outOfStockData = [
        {
          ...mockProductData[0],
          is_featured: false,
          product_variants: [
            {
              id: 'var-1',
              price: 1000,
              inventory: [{ quantity_available: 0 }]
            }
          ]
        }
      ];

      mockSupabaseClient.limit.mockResolvedValue({
        data: outOfStockData,
        error: null,
        count: 1
      });

      const result = await fetchProducts();

      expect(result.data[0].badge).toBe('Out of Stock');
    });

    it('should show featured badge for featured products', async () => {
      const featuredData = [
        {
          ...mockProductData[0],
          is_featured: true,
          product_variants: [
            {
              id: 'var-1',
              price: 1000,
              inventory: [{ quantity_available: 10 }]
            }
          ]
        }
      ];

      mockSupabaseClient.limit.mockResolvedValue({
        data: featuredData,
        error: null,
        count: 1
      });

      const result = await fetchProducts();

      expect(result.data[0].badge).toBe('Featured');
    });
  });

  describe('fetchProductBySlug', () => {
    it('should fetch product by slug correctly', async () => {
      const mockProductData = {
        product: {
          id: 'prod-1',
          name: 'Test Product',
          slug: 'test-product',
          description: 'A test product'
        },
        variants: [
          { id: 'var-1', price: 1000, sku: 'SKU001' }
        ],
        images: [],
        inventory: { 'var-1': { quantity_available: 10 } }
      };

      mockRpc.mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: mockProductData,
          error: null
        })
      });

      const result = await fetchProductBySlug('test-product');

      expect(mockRpc).toHaveBeenCalledWith('get_product_with_variants', { product_slug: 'test-product' });
      expect(result).toBeDefined();
      expect(result?.product.id).toBe('prod-1');
      expect(result?.variants[0].id).toBe('var-1');
    });

    it('should handle product not found', async () => {
      mockRpc.mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'No rows returned' }
        })
      });

      const result = await fetchProductBySlug('non-existent-product');

      expect(result).toBeNull();
    });
  });

  describe('getProductCategories', () => {
    it('should return fallback categories', async () => {
      // getProductCategories returns hardcoded categories for now
      const result = await getProductCategories();

      expect(result).toEqual([
        'casual',
        'ethnic',
        'formal',
        'streetwear'
      ]);
    });

    it('should always return categories array', async () => {
      // getProductCategories returns hardcoded categories for now
      const result = await getProductCategories();

      expect(result).toEqual([
        'casual',
        'ethnic',
        'formal',
        'streetwear'
      ]);
    });
  });

  describe('Booking Engine Functions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('fetchActiveStylistsWithServices', () => {
      it('should fetch active stylists with their services', async () => {
        const mockStylists = [
          {
            user_id: 'stylist-1',
            display_name: 'Sarah Johnson',
            title: 'Senior Stylist',
            bio: 'Expert stylist',
            years_experience: 5,
            specialties: ['Hair', 'Color'],
            timezone: 'Asia/Kathmandu',
            is_active: true,
            rating_average: 4.5,
            total_bookings: 100,
            stylist_services: [
              {
                service_id: 'service-1',
                custom_price_cents: 2000,
                custom_duration_minutes: 60,
                is_available: true,
                services: {
                  id: 'service-1',
                  name: 'Haircut',
                  slug: 'haircut',
                  description: 'Professional haircut',
                  category: 'hair',
                  duration_minutes: 45,
                  base_price_cents: 1500,
                  requires_consultation: false,
                  is_active: true
                }
              }
            ]
          }
        ];

        // Mock the chained calls - order.mockResolvedValueOnce returns the final data
        mockSupabaseClient.order.mockResolvedValueOnce({
          data: mockStylists,
          error: null
        });

        const result = await fetchActiveStylistsWithServices();

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('stylist_profiles');
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_active', true);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          id: 'stylist-1',
          displayName: 'Sarah Johnson',
          services: expect.arrayContaining([
            expect.objectContaining({
              id: 'service-1',
              name: 'Haircut',
              priceCents: 2000, // Custom price overrides base
              durationMinutes: 60 // Custom duration overrides base
            })
          ])
        });
      });

      it('should return empty array on error', async () => {
        mockSupabaseClient.select.mockResolvedValueOnce({
          data: null,
          error: { message: 'Database error' }
        });

        const result = await fetchActiveStylistsWithServices();

        expect(result).toEqual([]);
      });
    });

    describe('fetchAvailableSlots', () => {
      const mockRpc = jest.fn();

      beforeEach(() => {
        mockSupabaseClient.rpc = mockRpc;
      });

      it('should fetch available slots for a stylist and service', async () => {
        const mockSlots = [
          {
            slot_start_utc: '2024-01-15T04:15:00Z',
            slot_end_utc: '2024-01-15T05:15:00Z',
            slot_start_local: '2024-01-15T10:00:00+05:45',
            slot_end_local: '2024-01-15T11:00:00+05:45',
            slot_display: '10:00 - 11:00',
            is_available: true,
            price_cents: 1500
          }
        ];

        mockRpc.mockResolvedValueOnce({
          data: mockSlots,
          error: null
        });

        const result = await fetchAvailableSlots({
          stylistId: 'stylist-1',
          serviceId: 'service-1',
          targetDate: '2024-01-15',
          customerTimezone: 'Asia/Kathmandu'
        });

        expect(mockRpc).toHaveBeenCalledWith('get_available_slots', {
          p_stylist_id: 'stylist-1',
          p_service_id: 'service-1',
          p_target_date: '2024-01-15',
          p_customer_timezone: 'Asia/Kathmandu'
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          slotStartUtc: '2024-01-15T04:15:00Z',
          slotDisplay: '10:00 - 11:00',
          isAvailable: true,
          priceCents: 1500
        });
      });

      it('should return empty array on RPC error', async () => {
        mockRpc.mockResolvedValueOnce({
          data: null,
          error: { message: 'RPC error' }
        });

        const result = await fetchAvailableSlots({
          stylistId: 'stylist-1',
          serviceId: 'service-1',
          targetDate: '2024-01-15'
        });

        expect(result).toEqual([]);
      });
    });

    describe('createBooking', () => {
      const mockRpc = jest.fn();
      const mockAuth = {
        getUser: jest.fn()
      };

      beforeEach(() => {
        mockSupabaseClient.rpc = mockRpc;
        mockSupabaseClient.auth = mockAuth;
      });

      it('should create a booking successfully', async () => {
        mockAuth.getUser.mockResolvedValueOnce({
          data: { 
            user: { 
              id: 'user-1',
              email: 'user@example.com' 
            } 
          },
          error: null
        });

        mockRpc.mockResolvedValueOnce({
          data: {
            success: true,
            booking_id: 'booking-123',
            start_time: '2024-01-15T04:15:00Z',
            end_time: '2024-01-15T05:15:00Z',
            price_cents: 1500
          },
          error: null
        });

        const result = await createBooking({
          stylistId: 'stylist-1',
          serviceId: 'service-1',
          startTime: '2024-01-15T04:15:00Z',
          customerName: 'John Doe',
          customerPhone: '+1234567890'
        });

        expect(mockAuth.getUser).toHaveBeenCalled();
        expect(mockRpc).toHaveBeenCalledWith('create_booking', expect.objectContaining({
          p_customer_id: 'user-1',
          p_stylist_id: 'stylist-1',
          p_service_id: 'service-1',
          p_start_time: '2024-01-15T04:15:00Z',
          p_customer_name: 'John Doe',
          p_customer_phone: '+1234567890'
        }));

        expect(result).toMatchObject({
          success: true,
          bookingId: 'booking-123',
          priceCents: 1500
        });
      });

      it('should return error if user is not authenticated', async () => {
        mockAuth.getUser.mockResolvedValueOnce({
          data: { user: null },
          error: null
        });

        const result = await createBooking({
          stylistId: 'stylist-1',
          serviceId: 'service-1',
          startTime: '2024-01-15T04:15:00Z',
          customerName: 'John Doe'
        });

        expect(result).toMatchObject({
          success: false,
          error: 'You must be logged in to book an appointment',
          code: 'AUTH_REQUIRED'
        });
        expect(mockRpc).not.toHaveBeenCalled();
      });

      it('should handle booking conflicts', async () => {
        mockAuth.getUser.mockResolvedValueOnce({
          data: { user: { id: 'user-1' } },
          error: null
        });

        mockRpc.mockResolvedValueOnce({
          data: {
            success: false,
            error: 'Time slot is no longer available',
            code: 'SLOT_UNAVAILABLE'
          },
          error: null
        });

        const result = await createBooking({
          stylistId: 'stylist-1',
          serviceId: 'service-1',
          startTime: '2024-01-15T04:15:00Z',
          customerName: 'John Doe'
        });

        expect(result).toMatchObject({
          success: false,
          error: 'Time slot is no longer available',
          code: 'SLOT_UNAVAILABLE'
        });
      });
    });
  });
});
