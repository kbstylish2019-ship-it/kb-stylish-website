// ==========================================
// ENTERPRISE TEST FOUNDATION - PHASE 1
// Environment Configuration (MUST BE FIRST)
// ==========================================

// CRITICAL: Set environment variables BEFORE any imports
// This ensures CartAPIClient reads correct values at module load time
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-12345';

// Import testing utilities AFTER environment is configured
import '@testing-library/jest-dom'
import React from 'react'

// Polyfill TextEncoder/TextDecoder for Node.js test environment
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder
}

// Polyfill Request for Node.js test environment
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(url, options = {}) {
      this.url = url;
      this.method = options.method || 'GET';
      this.headers = options.headers || {};
      this.body = options.body;
    }
  }
}

// Polyfill Response for Node.js test environment
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, options = {}) {
      this.body = body;
      this.status = options.status || 200;
      this.statusText = options.statusText || 'OK';
      this.headers = options.headers || {};
    }
    
    async json() {
      return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
    }
    
    async text() {
      return typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
    }
  }
}

// ==========================================
// ENTERPRISE TEST FOUNDATION - PHASE 2
// Bulletproof Global Fetch Mock
// ==========================================

// Default successful response for all CartAPI operations
const createDefaultCartResponse = () => ({
  success: true,
  cart: {
    id: 'mock_cart_123',
    user_id: null,
    session_id: 'mock_guest_123',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    cart_items: [],
    item_count: 0,
    subtotal: 0
  }
});

// Global fetch mock with realistic Response objects
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    json: () => Promise.resolve(createDefaultCartResponse()),
    text: () => Promise.resolve(JSON.stringify(createDefaultCartResponse())),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    clone: () => ({ json: () => Promise.resolve(createDefaultCartResponse()) }),
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic',
    url: 'https://mock.supabase.co/functions/v1/cart-manager'
  })
);

// Global mock cleanup - prevents test interference
beforeEach(() => {
  // Clear all mock call history but preserve mock implementation
  global.fetch.mockClear();
  
  // Reset to default successful response
  global.fetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve(createDefaultCartResponse()),
      text: () => Promise.resolve(JSON.stringify(createDefaultCartResponse())),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      formData: () => Promise.resolve(new FormData()),
      clone: () => ({ json: () => Promise.resolve(createDefaultCartResponse()) }),
      body: null,
      bodyUsed: false,
      redirected: false,
      type: 'basic',
      url: 'https://mock.supabase.co/functions/v1/cart-manager'
    })
  );
});

// Don't mock cartAPI globally - let individual tests decide
// jest.mock('@/lib/api/cartClient');

// Mock window.alert to prevent JSDOM warnings
Object.defineProperty(window, 'alert', {
  writable: true,
  value: jest.fn(),
});

// Note: apiClient mock moved to individual test files to avoid global conflicts

// Mock auth functions for testing
jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(() => Promise.resolve(null)), // Default to guest user
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(),
}))

// 1) focus-trap-react: passthrough to avoid tabbable-node errors in JSDOM
jest.mock('focus-trap-react', () => ({
  __esModule: true,
  default: ({ children }) => children,
}))

// (Removed) Do not globally mock OrdersTable to preserve its unit tests

// 5) DashboardLayout: simple, accessible structure for testing
jest.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ title, actions, sidebar, children }) => (
    <main>
      <div>
        <aside>{sidebar}</aside>
        <section>
          {(title || actions) && (
            <div>
              {title ? <h1>{title}</h1> : null}
              {actions}
            </div>
          )}
          {children}
        </section>
      </div>
    </main>
  ),
}))

// 2) next/image: render as a plain <img> and strip Next-only props (fill, placeholder, etc.)
jest.mock('next/image', () => ({
  __esModule: true,
  default: React.forwardRef(({ src, alt, width, height, fill, placeholder, blurDataURL, loader, quality, onLoadingComplete, ...rest }, ref) => {
    const resolvedSrc = typeof src === 'string' ? src : (src && src.src) || ''
    return React.createElement('img', { ref, src: resolvedSrc, alt, width, height, ...rest })
  }),
}))

// 3) next/navigation: stable router hooks with spies
jest.mock('next/navigation', () => {
  const push = jest.fn()
  const replace = jest.fn()
  const prefetch = jest.fn()
  const back = jest.fn()
  return {
    __esModule: true,
    useRouter: () => ({ push, replace, prefetch, back }),
    useSearchParams: () => ({
      get: () => null,
      toString: () => '',
    }),
  }
})

// 4) next/dynamic: synchronously resolve the imported module for tests
// Strategy: parse the importer function's source to extract the module path from import("<path>")
// Then require() it immediately (Jest respects moduleNameMapper), returning its default export.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (importer /*, options*/ ) => {
    try {
      const src = importer && importer.toString ? importer.toString() : ''
      const candidates = new Set()
      // import("module") and require("module")
      const reImport = /import\((['"`])([^'"`]+)\1\)/g
      const reRequire = /require\((['"`])([^'"`]+)\1\)/g
      // Any quoted string literal; we'll attempt to require() each one
      const reAnyString = /(['"`])([^'"`]+)\1/g

      let m
      while ((m = reImport.exec(src))) candidates.add(m[2])
      while ((m = reRequire.exec(src))) candidates.add(m[2])
      while ((m = reAnyString.exec(src))) candidates.add(m[2])

      for (const p of candidates) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mod = require(p)
          if (mod) return mod.default || mod
        } catch {}
      }
    } catch (e) {
      // fall through to fallback
    }

    // Fallback: try invoking importer synchronously
    try {
      const maybe = importer()
      if (maybe && typeof maybe === 'object' && 'default' in maybe) {
        return maybe.default
      }
    } catch (_) {}

    // Final fallback: render test-friendly standins based on props
    return function DynamicFallback(props) {
      // Emulate layout-like components (e.g., DashboardLayout)
      if (props && (props.title || props.actions || props.children)) {
        return (
          <main>
            <div>
              <section>
                {(props.title || props.actions) && (
                  <div>
                    {props.title ? <h1>{props.title}</h1> : null}
                    {props.actions || null}
                  </div>
                )}
                {props.children}
              </section>
            </div>
          </main>
        )
      }

      // Emulate UsersTable essentials for page tests
      if (props && Array.isArray(props.users)) {
        const {
          users = [], searchQuery = '', onSearchChange,
          roleFilter = 'all', onRoleFilterChange,
          statusFilter = 'all', onStatusFilterChange,
          currentPage = 1, totalPages = 1,
          pageSize = 10, onPageSizeChange,
          onPageChange, totalUsers = users.length,
        } = props
        const startIndex = (currentPage - 1) * pageSize + 1
        const endIndex = Math.min(currentPage * pageSize, totalUsers)

        return (
          <div>
            <div>
              {onSearchChange ? (
                <input
                  data-testid="users-search-input"
                  aria-label="Search users"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              ) : null}
              {onRoleFilterChange ? (
                <select data-testid="role-filter" value={roleFilter} onChange={(e) => onRoleFilterChange(e.target.value)}>
                  <option value="all">All Roles</option>
                  <option value="customer">Customer</option>
                  <option value="vendor">Vendor</option>
                  <option value="admin">Admin</option>
                  <option value="guest">Guest</option>
                </select>
              ) : null}
              {onStatusFilterChange ? (
                <select data-testid="status-filter" value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Pending">Pending</option>
                  <option value="Banned">Banned</option>
                </select>
              ) : null}
              {onPageSizeChange ? (
                <select data-testid="page-size-select" value={String(pageSize)} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
                  <option value="5">5 per page</option>
                  <option value="10">10 per page</option>
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                </select>
              ) : null}
            </div>
            <div data-testid="users-table">
              <table><tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.status}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
            {onPageChange && totalPages > 1 ? (
              <div>
                <div>Showing {startIndex} to {endIndex} of {totalUsers} users</div>
                <button data-testid="page-2" onClick={() => onPageChange(2)}>2</button>
              </div>
            ) : null}
          </div>
        )
      }

      // Emulate OrdersTable essentials for page tests
      if (props && Array.isArray(props.orders)) {
        const {
          orders = [], searchQuery = '', onSearchChange,
          currentPage = 1, totalPages = 1,
          pageSize = 10, onPageSizeChange,
          onPageChange, totalOrders = orders.length,
        } = props
        const startIndex = (currentPage - 1) * pageSize + 1
        const endIndex = Math.min(currentPage * pageSize, totalOrders)

        return (
          <div>
            <div>
              {onSearchChange ? (
                <input
                  data-testid="orders-search-input"
                  aria-label="Search orders"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              ) : null}
              {onPageSizeChange ? (
                <select data-testid="page-size-select" value={String(pageSize)} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
                  <option value="5">5 per page</option>
                  <option value="10">10 per page</option>
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                </select>
              ) : null}
            </div>
            <div data-testid="orders-table">
              <table><tbody>
                {orders.map((o) => (
                  <tr key={o.id}><td>{o.id}</td></tr>
                ))}
              </tbody></table>
            </div>
            {onPageChange && totalPages > 1 ? (
              <div>
                <div>Showing {startIndex} to {endIndex} of {totalOrders} orders</div>
                <button data-testid="page-2" onClick={() => onPageChange(2)}>2</button>
              </div>
            ) : null}
          </div>
        )
      }

      return null
    }
  },
}))
