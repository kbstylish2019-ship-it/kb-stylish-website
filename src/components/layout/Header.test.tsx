import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import HeaderClientControls from './HeaderClientControls'
import { useCartStore } from '@/lib/store/cartStore'
import type { UserCapability } from '@/lib/types'

// Mock the cart store
jest.mock('@/lib/store/cartStore')

// Mock next/dynamic to return components immediately
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (fn: any) => {
    const Component = fn().then ? fn : () => fn();
    return Component;
  },
}))

// Mock the auth actions
jest.mock('@/app/actions/auth', () => ({
  signOut: jest.fn(),
}))

// Mock the AuthModal
jest.mock('@/components/features/AuthModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose }: any) => 
    isOpen ? <div data-testid="auth-modal">Auth Modal</div> : null,
}))

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

// Helper to mock cart store with new architecture
const mockCartStore = (itemCount: number = 0, isLoading: boolean = false) => {
  (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
    const state = {
      // New store structure
      items: Array(itemCount).fill({
        id: 'item_1',
        variant_id: 'variant_1',
        quantity: 1,
        price_snapshot: 1000,
        product_name: 'Test Product',
        product_slug: 'test-product',
        variant_sku: 'SKU001',
      }),
      totalItems: itemCount,
      totalAmount: itemCount * 1000,
      isLoading,
      isAddingItem: false,
      isMerging: false,
      error: null,
      
      // Actions (async now)
      getTotalQuantity: () => itemCount,
      fetchCart: jest.fn().mockResolvedValue(undefined),
      addItem: jest.fn().mockResolvedValue(true),
      updateItem: jest.fn().mockResolvedValue(true),
      removeItem: jest.fn().mockResolvedValue(true),
      
      // Legacy compatibility
      getItemCount: () => itemCount,
    };
    return typeof selector === 'function' ? selector(state) : state;
  })
}

describe('Header (Guest View)', () => {
  beforeEach(() => {
    mockCartStore(0)
  })

  test('renders primary navigation links', () => {
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[
        { id: 'shop', label: 'Shop', href: '/shop' },
        { id: 'about', label: 'About', href: '/about' },
        { id: 'apply_vendor', label: 'Become a Vendor', href: '/vendor/apply' },
      ]}
      profileNav={[]}
      showCart={true}
    />)

    // HeaderClientControls doesn't render brand, only navigation controls
    expect(screen.getByText('Shop')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Become a Vendor')).toBeInTheDocument()
  })

  test('shows login/register CTA', () => {
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[
        { id: 'shop', label: 'Shop', href: '/shop' },
        { id: 'about', label: 'About', href: '/about' },
        { id: 'apply_vendor', label: 'Become a Vendor', href: '/vendor/apply' },
      ]}
      profileNav={[]}
      showCart={true}
    />)

    const cta = screen.getByText(/Login.*Register/i)
    expect(cta).toBeInTheDocument()
    
    // Auth modal is conditionally rendered, check it opens on click
    fireEvent.click(cta)
    // HeaderClientControls manages its own state for authOpen
  })

  test('toggles mobile navigation', () => {
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[
        { id: 'shop', label: 'Shop', href: '/shop' },
        { id: 'about', label: 'About', href: '/about' },
        { id: 'apply_vendor', label: 'Become a Vendor', href: '/vendor/apply' },
      ]}
      profileNav={[]}
      showCart={true}
    />)

    const toggle = screen.getByLabelText(/toggle menu/i)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('Header (Cart Utility)', () => {
  test('renders cart icon when user has view_cart capability', () => {
    mockCartStore(0)
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[
        { id: 'shop', label: 'Shop', href: '/shop' },
        { id: 'about', label: 'About', href: '/about' },
        { id: 'apply_vendor', label: 'Become a Vendor', href: '/vendor/apply' },
      ]}
      profileNav={[]}
      showCart={true}
    />)
    expect(screen.getByTestId('cart-button')).toBeInTheDocument()
  })

  test('does not render cart icon if capability missing', () => {
    mockCartStore(0)
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[
        { id: 'shop', label: 'Shop', href: '/shop' },
        { id: 'about', label: 'About', href: '/about' },
      ]}
      profileNav={[]}
      showCart={false}
    />)
    expect(screen.queryByTestId('cart-button')).not.toBeInTheDocument()
  })

  test('badge not visible when cart is empty', () => {
    mockCartStore(0)
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[]}
      profileNav={[]}
      showCart={true}
    />)
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument()
  })

  test('badge visible and shows correct count when cart has items', () => {
    mockCartStore(3)
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[]}
      profileNav={[]}
      showCart={true}
    />)
    const badge = screen.getByTestId('cart-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('3')
  })

  test('badge shows 99+ when cart has more than 99 items', () => {
    mockCartStore(150)
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[]}
      profileNav={[]}
      showCart={true}
    />)
    const badge = screen.getByTestId('cart-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('99+')
  })

  test('clicking cart icon goes to /checkout', () => {
    mockCartStore(0)
    render(<HeaderClientControls 
      isAuthed={false}
      primaryNav={[]}
      profileNav={[]}
      showCart={true}
    />)
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
    render(<HeaderClientControls 
      isAuthed={true}
      primaryNav={[
        { id: 'shop', label: 'Shop', href: '/shop' },
        { id: 'bookings', label: 'My Bookings', href: '/bookings' },
      ]}
      profileNav={[
        { id: 'profile', label: 'Profile', href: '/profile' },
      ]}
      showCart={true}
    />)

    // Primary items
    expect(screen.getByText('Shop')).toBeInTheDocument()
    expect(screen.getByText('My Bookings')).toBeInTheDocument()

    // No login CTA
    expect(screen.queryByText(/Login.*Register/i)).not.toBeInTheDocument()

    // Profile dropdown button exists (not "Profile" text itself)
    const profileButton = screen.getByRole('button', { name: /profile/i })
    expect(profileButton).toBeInTheDocument()
  })  

  test('shows logout button in profile dropdown for authenticated users', () => {
    render(<HeaderClientControls 
      isAuthed={true}
      primaryNav={[
        { id: 'shop', label: 'Shop', href: '/shop' },
        { id: 'bookings', label: 'My Bookings', href: '/bookings' },
      ]}
      profileNav={[
        { id: 'profile', label: 'Profile', href: '/profile' },
      ]}
      showCart={true}
    />)

    // Click profile dropdown button to open menu
    const profileButton = screen.getByRole('button', { name: /profile/i })
    fireEvent.click(profileButton)
    
    // Check logout button exists in dropdown
    const logoutButton = screen.getByTestId('logout-button')
    expect(logoutButton).toBeInTheDocument()
    expect(logoutButton).toHaveTextContent(/log.*out/i)

    // When clicked, should call signOut action
    fireEvent.click(logoutButton)
    // Note: actual signOut behavior is tested in integration tests
  })
})
