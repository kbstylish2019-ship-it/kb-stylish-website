import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Header from './Header'
import { useCartStore } from '@/lib/store/cartStore'

// Mock the cart store
jest.mock('@/lib/store/cartStore')

const guestCaps = [
  'view_shop',
  'view_about',
  'apply_vendor',
  'view_cart',
] as const

const customerCaps = [
  'authenticated',
  'view_shop',
  'view_bookings',
  'view_profile',
  'view_cart',
] as const

// Helper to mock cart store
const mockCartStore = (itemCount: number = 0) => {
  (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
    const state = {
      getItemCount: () => itemCount,
    };
    return typeof selector === 'function' ? selector(state) : state;
  })
}

describe('Header (Guest View)', () => {
  beforeEach(() => {
    mockCartStore(0)
  })

  test('renders brand and primary navigation', () => {
    render(<Header capabilities={[...guestCaps]} />)

    expect(screen.getByText('KB Stylish')).toBeInTheDocument()
    expect(screen.getAllByRole('navigation')[0]).toBeInTheDocument()

    expect(screen.getAllByText('Shop')[0]).toBeInTheDocument()
    expect(screen.getAllByText('About')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Become a Vendor')[0]).toBeInTheDocument()
  })

  test('shows login/register CTA and opens modal', () => {
    render(<Header capabilities={[...guestCaps]} />)

    const cta = screen.getAllByText(/Login\s*\/\s*Register/i)[0]
    expect(cta).toBeInTheDocument()

    fireEvent.click(cta)
    const dialog = screen.getByRole('dialog', { name: /welcome to kb stylish/i })
    expect(dialog).toBeInTheDocument()
  })

  test('toggles mobile navigation', () => {
    render(<Header capabilities={[...guestCaps]} />)

    const toggle = screen.getByRole('button', { name: /toggle menu/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('Header (Cart Utility)', () => {
  test('renders cart icon when user has view_cart capability', () => {
    mockCartStore(0)
    render(<Header capabilities={[...guestCaps]} />)
    expect(screen.getByTestId('cart-button')).toBeInTheDocument()
  })

  test('does not render cart icon if capability missing', () => {
    mockCartStore(0)
    const capsWithoutCart = ['view_shop', 'view_about'] as const
    render(<Header capabilities={[...capsWithoutCart]} />)
    expect(screen.queryByTestId('cart-button')).toBeNull()
  })

  test('badge hidden when cart is empty', () => {
    mockCartStore(0)
    render(<Header capabilities={[...guestCaps]} />)
    expect(screen.queryByTestId('cart-badge')).toBeNull()
  })

  test('badge visible and shows correct count when cart has items', () => {
    mockCartStore(3)
    render(<Header capabilities={[...guestCaps]} />)
    const badge = screen.getByTestId('cart-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('3')
  })

  test('badge shows 99+ when cart has more than 99 items', () => {
    mockCartStore(150)
    render(<Header capabilities={[...guestCaps]} />)
    const badge = screen.getByTestId('cart-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('99+')
  })

  test('clicking cart icon goes to /checkout', () => {
    mockCartStore(0)
    render(<Header capabilities={[...guestCaps]} />)
    const cartLink = screen.getByTestId('cart-button') as HTMLAnchorElement
    // Next.js Link renders an <a href="/checkout"> in test env
    expect(cartLink).toHaveAttribute('href', '/checkout')
  })
})

describe('Header (Customer View)', () => {
  beforeEach(() => {
    mockCartStore(0)
  })

  test('shows customer primary nav and profile menu instead of login', () => {
    render(<Header capabilities={[...customerCaps]} />)

    // Primary items
    expect(screen.getAllByText('Shop')[0]).toBeInTheDocument()
    expect(screen.getAllByText('My Bookings')[0]).toBeInTheDocument()

    // No login CTA
    expect(screen.queryByText(/Login\s*\/\s*Register/i)).toBeNull()

    // Profile button present - check it exists
    expect(screen.getByText('Profile')).toBeInTheDocument()
    
    // Click profile to open dropdown
    fireEvent.click(screen.getByText('Profile'))
    
    // Check dropdown items are present (they exist in DOM even if hidden by CSS)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
