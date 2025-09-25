import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductActions from "@/components/product/ProductActions";
import type { ProductDetail } from "@/lib/types";
import { useCartStore } from "@/lib/store/cartStore";

// Mock the cart store
jest.mock("@/lib/store/cartStore");

const baseProduct: ProductDetail = {
  id: "p",
  slug: "p",
  name: "Test Product",
  description: "desc",
  price: 1000,
  currency: "NPR",
  vendor: { id: "v", name: "V" },
  images: [{ url: "test.jpg", alt: "Test" }],
  options: [],
  variants: [],
  avgRating: 4.5,
  reviewCount: 1,
  reviews: [],
  stockStatus: "in_stock",
  shipping: { estimated: "2-3 days", cost: "Free", codAvailable: true },
  returns: { days: 7, summary: "7-day returns" },
};

// Updated mocks for async cart store
const mockAddItem = jest.fn().mockResolvedValue(true);

describe("ProductActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock the useCartStore with new async architecture
    (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        // New async actions
        addItem: mockAddItem,
        updateItem: jest.fn().mockResolvedValue(true),
        removeItem: jest.fn().mockResolvedValue(true),
        
        // Loading states
        isAddingItem: false,
        isUpdatingItem: {},
        isRemovingItem: {},
        
        // State
        items: [],
        totalItems: 0,
        totalAmount: 0,
        
        // Legacy compatibility (if needed)
        addProduct: async (product: any) => {
          // Convert old addProduct call to new addItem
          return mockAddItem(product.variantId || product.id, product.quantity || 1, {
            name: product.name,
            slug: product.slug || product.name.toLowerCase().replace(/\s+/g, '-'),
            price: product.price,
            sku: product.sku,
            image: product.imageUrl,
          });
        },
      };
      // If selector is provided, call it with state, otherwise return the whole state
      return typeof selector === 'function' ? selector(state) : state;
    });
  });
  it("disables add to cart when no variant selected and has options", () => {
    const { rerender } = render(<ProductActions product={baseProduct} />);
    const btn = screen.getByRole("button", { name: /add to cart/i });
    // With no selectedVariant provided, disabled
    expect(btn).toBeDisabled();

    // When variant with stock is provided, enabled
    rerender(
      <ProductActions
        product={baseProduct}
        selectedVariant={{ id: "v1", options: {}, price: 1000, stock: 2 }}
      />
    );
    expect(screen.getByRole("button", { name: /add to cart/i })).toBeEnabled();
  });

  it("shows out of stock when variant stock is 0", () => {
    render(
      <ProductActions
        product={baseProduct}
        selectedVariant={{ id: "v2", options: {}, price: 1000, stock: 0 }}
      />
    );
    expect(screen.getByText(/out of stock/i)).toBeInTheDocument();
  });

  it("calls addProduct when Add to Cart is clicked", async () => {
    const variant = { id: "v1", options: { Size: "M" }, price: 1200, stock: 5 };
    render(
      <ProductActions
        product={baseProduct}
        selectedVariant={variant}
      />
    );

    const addBtn = screen.getByRole("button", { name: /add to cart/i });
    fireEvent.click(addBtn);

    // Check that the mock was called (through the legacy adapter)
    expect(mockAddItem).toHaveBeenCalledWith("v1", 1, expect.objectContaining({
      name: "Test Product",
      price: 1200,
      image: "test.jpg",
    }));

    // Check for success state
    expect(addBtn).toHaveTextContent(/adding/i);
  });

  it("allows quantity change before adding to cart", () => {
    const variant = { id: "v1", options: {}, price: 1000, stock: 10 };
    render(
      <ProductActions
        product={baseProduct}
        selectedVariant={variant}
      />
    );

    const qtyInput = screen.getByRole("spinbutton");
    fireEvent.change(qtyInput, { target: { value: "3" } });

    const addBtn = screen.getByRole("button", { name: /add to cart/i });
    fireEvent.click(addBtn);

    // Verify the addItem was called with quantity 3
    expect(mockAddItem).toHaveBeenCalledWith("v1", 3, expect.objectContaining({
      name: "Test Product",
      price: 1000,
    }));
  });

  it("resets quantity to 1 after adding to cart", () => {
    const variant = { id: "v1", options: {}, price: 1000, stock: 10 };
    render(
      <ProductActions
        product={baseProduct}
        selectedVariant={variant}
      />
    );

    const qtyInput = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: "5" } });
    expect(qtyInput.value).toBe("5");

    const addBtn = screen.getByRole("button", { name: /add to cart/i });
    fireEvent.click(addBtn);

    // After adding, quantity should reset to 1
    expect(qtyInput.value).toBe("1");
  });
});
