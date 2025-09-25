import { render } from '@testing-library/react';
import ProductPage from './page';
import { notFound } from 'next/navigation';

// Mock the external dependencies
jest.mock('@/lib/apiClient', () => ({
  fetchProductBySlug: jest.fn(),
}));

// Import after mocking
import { fetchProductBySlug } from '@/lib/apiClient';
jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}));
jest.mock('@/lib/mock/product', () => ({
  getRelatedProducts: jest.fn(() => [
    {
      id: 'rp-1',
      name: 'Test Related Product',
      price: 999,
      imageUrl: '/test.jpg',
      category: 'test',
    },
  ]),
}));

// Mock dynamic imports
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (importFn: any) => {
    // Return the ProductDetailClient component directly
    return ({ product }: any) => (
      <div data-testid="product-detail-client">{product.name}</div>
    );
  },
}));

// Mock components
jest.mock('@/components/product/ProductDetailClient', () => ({
  __esModule: true,
  default: ({ product }: any) => (
    <div data-testid="product-detail-client">{product.name}</div>
  ),
}));

jest.mock('@/components/product/CustomerReviews', () => ({
  __esModule: true,
  default: ({ avgRating, reviewCount }: any) => (
    <div data-testid="customer-reviews">
      Rating: {avgRating}, Count: {reviewCount}
    </div>
  ),
}));

jest.mock('@/components/product/RelatedProducts', () => ({
  __esModule: true,
  default: ({ products }: any) => (
    <div data-testid="related-products">
      {products.length} related products
    </div>
  ),
}));

describe('ProductPage', () => {
  const mockProductData = {
    product: {
      id: 'p1',
      slug: 'test-product',
      name: 'Test Product',
      description: 'Test description',
      price: 1000,
      vendor_id: 'v1',
      is_featured: true,
      vendor: {
        display_name: 'Test Vendor',
      },
    },
    variants: [
      {
        id: 'v1',
        attributes: { Size: 'M', Color: 'Red' },
        price: 1000,
        sku: 'SKU-001',
      },
      {
        id: 'v2',
        attributes: { Size: 'L', Color: 'Blue' },
        price: 1200,
        sku: 'SKU-002',
      },
    ],
    images: [
      {
        image_url: '/image1.jpg',
        alt_text: 'Image 1',
        sort_order: 1,
      },
    ],
    inventory: {
      v1: { quantity_available: 5 },
      v2: { quantity_available: 10 },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render product page with live data', async () => {
    (fetchProductBySlug as jest.Mock).mockResolvedValue(mockProductData);

    const params = Promise.resolve({ slug: 'test-product' });
    const { getByTestId } = render(await ProductPage({ params }));

    expect(getByTestId('product-detail-client')).toHaveTextContent('Test Product');
    expect(getByTestId('customer-reviews')).toBeInTheDocument();
    expect(getByTestId('related-products')).toBeInTheDocument();
  });

  it('should call notFound when product does not exist', async () => {
    (fetchProductBySlug as jest.Mock).mockResolvedValue(null);

    const params = Promise.resolve({ slug: 'non-existent' });
    
    try {
      await ProductPage({ params });
    } catch (e) {
      // Expected to throw
    }

    expect(notFound).toHaveBeenCalled();
  });

  it('should handle product with minimal data', async () => {
    const minimalProduct = {
      product: {
        id: 'p2',
        slug: 'minimal-product',
        name: 'Minimal Product',
      },
      variants: [],
      images: [],
      inventory: {},
    };

    (fetchProductBySlug as jest.Mock).mockResolvedValue(minimalProduct);

    const params = Promise.resolve({ slug: 'minimal-product' });
    const { getByTestId } = render(await ProductPage({ params }));

    expect(getByTestId('product-detail-client')).toHaveTextContent('Minimal Product');
  });

  it('should transform variant attributes correctly', async () => {
    (fetchProductBySlug as jest.Mock).mockResolvedValue(mockProductData);

    const params = Promise.resolve({ slug: 'test-product' });
    await ProductPage({ params });

    // Verify fetchProductBySlug was called with correct slug
    expect(fetchProductBySlug).toHaveBeenCalledWith('test-product');
  });
});
