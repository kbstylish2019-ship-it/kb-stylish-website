import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductActions from "@/components/product/ProductActions";
import type { ProductDetail } from "@/lib/types";

// Mock the cart store module completely
jest.mock("@/lib/store/cartStore", () => ({
  useCartStore: jest.fn()
}));

// Import after mocking
import { useCartStore } from "@/lib/store/cartStore";

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

const mockAddProduct = jest.fn();

describe("ProductActions Debug", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock the useCartStore to always return mockAddProduct when called with any selector
    (useCartStore as jest.Mock).mockImplementation((selector: any) => {
      // If no selector, return the whole state
      if (!selector) {
        return { addProduct: mockAddProduct };
      }
      // If selector is provided, call it with a mock state
      const mockState = {
        addProduct: mockAddProduct,
      };
      return selector(mockState);
    });
  });

  it("calls addProduct when Add to Cart is clicked", () => {
    const variant = { id: "v1", options: { Size: "M" }, price: 1200, stock: 5 };
    render(
      <ProductActions
        product={baseProduct}
        selectedVariant={variant}
      />
    );

    const addBtn = screen.getByRole("button", { name: /add to cart/i });
    fireEvent.click(addBtn);

    expect(mockAddProduct).toHaveBeenCalledTimes(1);
    expect(mockAddProduct).toHaveBeenCalledWith({
      id: "p",
      name: "Test Product",
      variant: "v1",
      imageUrl: "test.jpg",
      price: 1200,
      quantity: 1,
    });
  });
});
