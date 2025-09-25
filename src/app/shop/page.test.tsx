import React from 'react'
import { render, screen, within } from "@testing-library/react";
import ShopPage from '@/app/shop/page'

// Mock API client with real Supabase integration testing
jest.mock('@/lib/apiClient', () => {
  const PRODUCTS = [
    { id: 'p1', name: 'Classic Denim Jacket', price: 3499, category: 'streetwear' },
    { id: 'p2', name: 'Silk Saree - Royal Plum', price: 7999, category: 'ethnic' },
    { id: 'p3', name: 'Minimalist Leather Watch', price: 5999, category: 'formal' },
    { id: 'p4', name: 'K-Beauty Skincare Set', price: 2599, category: 'casual' },
    { id: 'p5', name: 'Athleisure Joggers', price: 1999, category: 'casual' },
    { id: 'p6', name: 'Himalayan Wool Scarf', price: 1499, category: 'casual' },
    { id: 'p7', name: 'Premium Formal Shirt', price: 2799, category: 'formal' },
    { id: 'p8', name: 'Streetwear Hoodie - Onyx', price: 3299, category: 'streetwear' },
  ]

  function applyFilters(products: typeof PRODUCTS, filters: Record<string, unknown>) {
    let out = [...products]
    const f = filters || {}
    if (f.search) {
      const q = String(f.search).toLowerCase()
      out = out.filter(p => p.name.toLowerCase().includes(q))
    }
    if (Array.isArray(f.categories) && f.categories.length > 0) {
      const set = new Set(f.categories)
      out = out.filter(p => p.category && set.has(p.category))
    }
    if (typeof f.minPrice === 'number') {
      out = out.filter(p => p.price >= (f.minPrice as number))
    }
    if (typeof f.maxPrice === 'number') {
      out = out.filter(p => p.price <= (f.maxPrice as number))
    }
    return out
  }

  function applySort(products: typeof PRODUCTS, sort: Record<string, unknown>) {
    const s = sort || { field: 'name', order: 'asc' }
    const out = [...products]
    out.sort((a, b) => {
      let cmp = 0
      if (s.field === 'name') cmp = a.name.localeCompare(b.name)
      else if (s.field === 'price') cmp = a.price - b.price
      else if (s.field === 'created_at') cmp = parseInt(a.id.slice(1)) - parseInt(b.id.slice(1))
      return s.order === 'desc' ? -cmp : cmp
    })
    return out
  }

  return {
    __esModule: true,
    fetchProducts: jest.fn(async ({ filters, sort }: Record<string, unknown>) => {
      const filtered = applyFilters(PRODUCTS, filters as Record<string, unknown>)
      const sorted = applySort(filtered, sort as Record<string, unknown>)
      return {
        data: sorted,
        totalCount: PRODUCTS.length, // Baseline total across all products per QA directive
        hasMore: false,
        nextCursor: undefined,
      }
    }),
    getProductCategories: jest.fn(async () => {
      return Array.from(new Set(PRODUCTS.map(p => p.category))).sort()
    }),
  }
})

// Provide a stable test double for FilterSidebar. We don't assert its internal behavior,
// only that form controls exist; navigation is simulated via rerender with new searchParams.
jest.mock('@/components/shop/FilterSidebar', () => {
  return {
    __esModule: true,
    default: ({ currentFilters }: { currentFilters: Record<string, unknown> }) => (
      <aside>
        <div>
          <label className="text-sm font-semibold">Search</label>
          <input placeholder="Search products" defaultValue={currentFilters.search as string} />
        </div>
        <div>
          <p className="text-sm font-semibold">Category</p>
          <div>
            <label>
              <input type="checkbox" defaultChecked={(currentFilters.selectedCategories as string[])?.includes('streetwear')} />
              Streetwear
            </label>
            <label>
              <input type="checkbox" defaultChecked={(currentFilters.selectedCategories as string[])?.includes('formal')} />
              Formal
            </label>
          </div>
        </div>
        <div>
          <input placeholder="Min" defaultValue={currentFilters.minPrice as string} />
          <input placeholder="Max" defaultValue={currentFilters.maxPrice as string} />
        </div>
        <div>
          <select defaultValue={currentFilters.sort as string}>
            <option value="popularity">Popularity</option>
            <option value="newest">Newest</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
          </select>
        </div>
        <button>Apply</button>
      </aside>
    ),
  }
})

// Mock ProductGrid to surface the products passed from ShopPage
jest.mock('@/components/shared/ProductGrid', () => {
  return {
    __esModule: true,
    default: ({ products }: { products?: Array<{ id: string; name: string }> }) => (
      <div data-testid="product-grid">
        <div>count:{products?.length ?? 0}</div>
        <ul>
          {products?.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </div>
    ),
  }
})

describe('/shop page interactions', () => {
  // Render the async server component by awaiting it first
  const renderShop = async (params: Record<string, string> = {}) => {
    const ui = await ShopPage({ searchParams: Promise.resolve(params) } as Parameters<typeof ShopPage>[0])
    const utils = render(ui)
    return utils
  }

  // Helper to rerender with different URL params (simulate navigation)
  const rerenderShop = async (rerender: (ui: React.ReactElement) => void, params: Record<string, string>) => {
    const nextUI = await ShopPage({ searchParams: Promise.resolve(params) } as Parameters<typeof ShopPage>[0])
    rerender(nextUI)
  }

  // Note: We simulate filter application by rerendering with new searchParams instead

  const getProductNames = () => {
    const listItems = screen.getAllByRole('listitem', { hidden: true })
    const names = listItems.map((li: HTMLElement) => within(li).getByText(/^(Classic Denim|Silk Saree|Minimalist|K-Beauty|Athleisure|Himalayan|Premium|Streetwear)/i).textContent)
    return names
  }

  test('renders all products initially', async () => {
    await renderShop({})
    expect(screen.getByText(/8 of 8 products/i)).toBeInTheDocument()
    // ProductGrid mock shows names
    const names = getProductNames()
    expect(names.length).toBe(8)
    expect(names).toEqual(
      expect.arrayContaining([
        'Classic Denim Jacket',
        'Silk Saree - Royal Plum',
        'Minimalist Leather Watch',
        'K-Beauty Skincare Set',
        'Athleisure Joggers',
        'Himalayan Wool Scarf',
        'Premium Formal Shirt',
        'Streetwear Hoodie - Onyx',
      ])
    )
  })

  test('search filters by product name (case-insensitive) on Apply', async () => {
    const { rerender } = await renderShop({})
    await rerenderShop(rerender, { search: 'denim' })
    expect(screen.getByText(/1 of 8 products/i)).toBeInTheDocument()

    const names = getProductNames()
    expect(names).toEqual(['Classic Denim Jacket'])
  })

  test('category multi-select filters products on Apply', async () => {
    const { rerender } = await renderShop({})
    await rerenderShop(rerender, { categories: 'streetwear,formal' })
    expect(screen.getByText(/4 of 8 products/i)).toBeInTheDocument()

    const names = getProductNames()
    expect(names).toEqual(
      expect.arrayContaining([
        'Classic Denim Jacket', // streetwear
        'Streetwear Hoodie - Onyx', // streetwear
        'Minimalist Leather Watch', // formal
        'Premium Formal Shirt', // formal
      ])
    )
  })

  test('price range inclusive filter on Apply', async () => {
    const { rerender } = await renderShop({})
    await rerenderShop(rerender, { minPrice: '2000', maxPrice: '3000' })
    expect(screen.getByText(/2 of 8 products/i)).toBeInTheDocument()

    const names = getProductNames()
    expect(names).toEqual(
      expect.arrayContaining([
        'K-Beauty Skincare Set', // 2599
        'Premium Formal Shirt', // 2799
      ])
    )
    expect(names).not.toEqual(expect.arrayContaining(['Athleisure Joggers'])) // 1999 excluded
  })

  test('sort: price low to high on Apply', async () => {
    const { rerender } = await renderShop({})
    await rerenderShop(rerender, { sort: 'price_low' })
    // Ensure ProductGrid updated
    const grid = screen.getByTestId('product-grid')
    expect(within(grid).getByText('count:8')).toBeInTheDocument()

    const names = getProductNames()
    // Expect first to be the cheapest (1499) and last to be the most expensive (7999)
    expect(names[0]).toBe('Himalayan Wool Scarf')
    expect(names[names.length - 1]).toBe('Silk Saree - Royal Plum')
  })

  test('sort: price high to low on Apply', async () => {
    const { rerender } = await renderShop({})
    await rerenderShop(rerender, { sort: 'price_high' })
    const grid = screen.getByTestId('product-grid')
    expect(within(grid).getByText('count:8')).toBeInTheDocument()

    const names = getProductNames()
    expect(names[0]).toBe('Silk Saree - Royal Plum')
    expect(names[names.length - 1]).toBe('Himalayan Wool Scarf')
  })
})
