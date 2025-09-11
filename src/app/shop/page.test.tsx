import React from 'react'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import ShopPage from '@/app/shop/page'

// Mock ProductGrid to surface the products passed from ShopPage
jest.mock('@/components/shared/ProductGrid', () => {
  return {
    __esModule: true,
    default: ({ products }: any) => (
      <div data-testid="product-grid">
        <div>count:{products?.length ?? 0}</div>
        <ul>
          {products?.map((p: any) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </div>
    ),
  }
})

describe('/shop page interactions', () => {
  const renderShop = () => render(<ShopPage />)

  const getApplyButton = () => screen.getByRole('button', { name: /apply/i })
  const getSearchInput = () => screen.getByPlaceholderText('Search products') as HTMLInputElement
  const getMinPriceInput = () => screen.getByPlaceholderText('Min') as HTMLInputElement
  const getMaxPriceInput = () => screen.getByPlaceholderText('Max') as HTMLInputElement
  const getSortSelect = () => screen.getByRole('combobox') as HTMLSelectElement

  const getProductNames = () => {
    const list = screen.getByTestId('product-grid')
    return within(list).queryAllByRole('listitem').map((li) => li.textContent)
  }

  test('renders all products initially', () => {
    renderShop()
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
    renderShop()
    fireEvent.change(getSearchInput(), { target: { value: 'denim' } })
    fireEvent.click(getApplyButton())

    await waitFor(() => {
      expect(screen.getByText(/1 of 8 products/i)).toBeInTheDocument()
    })

    const names = getProductNames()
    expect(names).toEqual(['Classic Denim Jacket'])
  })

  test('category multi-select filters products on Apply', async () => {
    renderShop()
    const streetwear = screen.getByLabelText('Streetwear') as HTMLInputElement
    const formal = screen.getByLabelText('Formal') as HTMLInputElement

    fireEvent.click(streetwear)
    fireEvent.click(formal)
    fireEvent.click(getApplyButton())

    await waitFor(() => {
      expect(screen.getByText(/4 of 8 products/i)).toBeInTheDocument()
    })

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
    renderShop()
    fireEvent.change(getMinPriceInput(), { target: { value: '2000' } })
    fireEvent.change(getMaxPriceInput(), { target: { value: '3000' } })
    fireEvent.click(getApplyButton())

    await waitFor(() => {
      expect(screen.getByText(/2 of 8 products/i)).toBeInTheDocument()
    })

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
    renderShop()
    fireEvent.change(getSortSelect(), { target: { value: 'price_low' } })
    fireEvent.click(getApplyButton())

    await waitFor(() => {
      // Ensure ProductGrid updated
      const grid = screen.getByTestId('product-grid')
      expect(within(grid).getByText('count:8')).toBeInTheDocument()
    })

    const names = getProductNames()
    // Expect first to be the cheapest (1499) and last to be the most expensive (7999)
    expect(names[0]).toBe('Himalayan Wool Scarf')
    expect(names[names.length - 1]).toBe('Silk Saree - Royal Plum')
  })

  test('sort: price high to low on Apply', async () => {
    renderShop()
    fireEvent.change(getSortSelect(), { target: { value: 'price_high' } })
    fireEvent.click(getApplyButton())

    await waitFor(() => {
      const grid = screen.getByTestId('product-grid')
      expect(within(grid).getByText('count:8')).toBeInTheDocument()
    })

    const names = getProductNames()
    expect(names[0]).toBe('Silk Saree - Royal Plum')
    expect(names[names.length - 1]).toBe('Himalayan Wool Scarf')
  })
})
