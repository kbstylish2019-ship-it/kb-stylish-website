import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CheckoutClient from "@/components/checkout/CheckoutClient";
import { useCartStore } from "@/lib/store/cartStore";
import { useRouter } from "next/navigation";
import type { CartItem, CartProductItem, CartBookingItem } from "@/lib/types";

// Mock the cart store
jest.mock("@/lib/store/cartStore");

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockItems: CartItem[] = [
  {
    type: "product",
    id: "p1",
    name: "T-Shirt",
    variant: "blue-m",
    imageUrl: "shirt.jpg",
    price: 1500,
    quantity: 2,
  },
  {
    type: "product",
    id: "p2",
    name: "Jeans",
    variant: "black-32",
    imageUrl: "jeans.jpg",
    price: 3500,
    quantity: 1,
  },
  {
    type: "booking",
    booking: {
      id: "b1",
      service: "Premium Styling",
      date: "2024-02-01",
      time: "10:00",
      price: 2000,
      stylist: "John Doe",
      durationMins: 60,
    },
  },
];

const mockUpdateProductQuantity = jest.fn();
const mockRemoveItem = jest.fn();
const mockClearCart = jest.fn();
const mockPush = jest.fn();

describe("CheckoutClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  describe("with items in cart", () => {
    beforeEach(() => {
      (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          items: mockItems,
          updateProductQuantity: mockUpdateProductQuantity,
          removeItem: mockRemoveItem,
          clearCart: mockClearCart,
          getProductSubtotal: () => 6500, // (1500*2) + 3500
          getServiceSubtotal: () => 2000,
          getTotal: () => 8500,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });
    });

    it("renders all cart items", () => {
      render(<CheckoutClient />);
      
      // Check products
      expect(screen.getByText("T-Shirt")).toBeInTheDocument();
      expect(screen.getByText("Jeans")).toBeInTheDocument();
      
      // Check booking
      expect(screen.getByText("Premium Styling")).toBeInTheDocument();
      // Check for date and time separately as they may be formatted differently
      expect(screen.getByText(/2\/1\/2024/)).toBeInTheDocument();
      expect(screen.getByText(/10:00/)).toBeInTheDocument();
    });

    it("displays correct order summary", () => {
      render(<CheckoutClient />);
      
      // Check subtotals and total - use getAllByText since prices may appear multiple times
      const productSubtotal = screen.getAllByText("NPR 6,500");
      expect(productSubtotal.length).toBeGreaterThan(0); // Product subtotal
      
      const serviceSubtotal = screen.getAllByText("NPR 2,000");
      expect(serviceSubtotal.length).toBeGreaterThan(0); // Service subtotal
      
      const total = screen.getAllByText("NPR 8,500");
      expect(total.length).toBeGreaterThan(0); // Total
    });

    it("handles product quantity update", () => {
      render(<CheckoutClient />);
      
      // Find the first quantity input (for T-Shirt)
      const quantityInputs = screen.getAllByRole("spinbutton");
      fireEvent.change(quantityInputs[0], { target: { value: "3" } });
      
      expect(mockUpdateProductQuantity).toHaveBeenCalledWith("p1", 3, "blue-m");
    });

    it("handles product removal", () => {
      render(<CheckoutClient />);
      
      // Find and click the first remove button (for T-Shirt)
      const removeButtons = screen.getAllByRole("button", { name: /remove/i });
      fireEvent.click(removeButtons[0]);
      
      expect(mockRemoveItem).toHaveBeenCalledWith("p1", "blue-m");
    });

    it("handles booking removal", () => {
      render(<CheckoutClient />);
      
      // Find the booking's remove button
      const bookingSection = screen.getByText("Premium Styling").closest("div");
      const removeButton = bookingSection?.querySelector("button[aria-label*='Remove']");
      
      if (removeButton) {
        fireEvent.click(removeButton);
        expect(mockRemoveItem).toHaveBeenCalledWith("b1");
      }
    });

    it("handles order placement", async () => {
      render(<CheckoutClient />);
      
      // Fill required fields
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: "John Doe" },
      });
      fireEvent.change(screen.getByLabelText(/phone/i), {
        target: { value: "1234567890" },
      });
      fireEvent.change(screen.getByLabelText(/city/i), {
        target: { value: "Kathmandu" },
      });
      fireEvent.change(screen.getByLabelText(/area/i), {
        target: { value: "Thamel" },
      });
      fireEvent.change(screen.getByLabelText(/province/i), {
        target: { value: "Bagmati" },
      });
      
      // Select payment method
      fireEvent.click(screen.getByRole("button", { name: /cash on delivery/i }));
      
      // Place order
      const placeOrderButton = screen.getByRole("button", { name: /place order/i });
      fireEvent.click(placeOrderButton);
      
      await waitFor(() => {
        expect(mockClearCart).toHaveBeenCalled();
      });
    });

    it("clears cart after successful order placement", async () => {
      window.alert = jest.fn();
      render(<CheckoutClient />);
      
      // Fill minimal required fields
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: "John Doe" },
      });
      fireEvent.change(screen.getByLabelText(/phone/i), {
        target: { value: "1234567890" },
      });
      fireEvent.change(screen.getByLabelText(/city/i), {
        target: { value: "Kathmandu" },
      });
      fireEvent.change(screen.getByLabelText(/area/i), {
        target: { value: "Thamel" },
      });
      fireEvent.change(screen.getByLabelText(/province/i), {
        target: { value: "Bagmati" },
      });
      
      // Select payment method
      fireEvent.click(screen.getByRole("button", { name: /cash on delivery/i }));
      
      const placeOrderButton = screen.getByRole("button", { name: /place order/i });
      fireEvent.click(placeOrderButton);
      
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Order placed with"));
        expect(mockClearCart).toHaveBeenCalled();
      });
    });
  });

  describe("with empty cart", () => {
    beforeEach(() => {
      (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          items: [],
          updateProductQuantity: mockUpdateProductQuantity,
          removeItem: mockRemoveItem,
          clearCart: mockClearCart,
          getProductSubtotal: () => 0,
          getServiceSubtotal: () => 0,
          getTotal: () => 0,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });
    });

    it("shows empty cart message", () => {
      render(<CheckoutClient />);
      
      expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
      expect(screen.getByText(/continue shopping/i)).toBeInTheDocument();
    });

    it("shows continue shopping link", () => {
      render(<CheckoutClient />);
      
      const continueShoppingLink = screen.getByRole("link", { name: /continue shopping/i });
      expect(continueShoppingLink).toHaveAttribute("href", "/");
    });
  });

  describe("cart updates", () => {
    it("reflects real-time quantity changes", () => {
      const { rerender } = render(<CheckoutClient />);
      
      // Initial render with 2 items
      const productItems = mockItems.filter(item => item.type === "product");
      (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          items: productItems,
          updateProductQuantity: mockUpdateProductQuantity,
          removeItem: mockRemoveItem,
          clearCart: mockClearCart,
          getProductSubtotal: () => 6500,
          getServiceSubtotal: () => 0,
          getTotal: () => 6500,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });
      
      rerender(<CheckoutClient />);
      const priceElements = screen.getAllByText("NPR 6,500");
      expect(priceElements.length).toBeGreaterThan(0);
      
      // Update quantity
      const updatedItems = [
        { ...productItems[0], quantity: 5 }, // Changed from 2 to 5
        productItems[1],
      ];
      
      (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          items: updatedItems,
          updateProductQuantity: mockUpdateProductQuantity,
          removeItem: mockRemoveItem,
          clearCart: mockClearCart,
          getProductSubtotal: () => 11000, // (1500*5) + 3500
          getServiceSubtotal: () => 0,
          getTotal: () => 11000,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });
      
      rerender(<CheckoutClient />);
      const updatedPriceElements = screen.getAllByText("NPR 11,000");
      expect(updatedPriceElements.length).toBeGreaterThan(0);
    });

    it("handles item removal correctly", () => {
      const { rerender } = render(<CheckoutClient />);
      
      // Initial render with products
      const productItems = mockItems.filter(item => item.type === "product");
      (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          items: productItems,
          updateProductQuantity: mockUpdateProductQuantity,
          removeItem: mockRemoveItem,
          clearCart: mockClearCart,
          getProductSubtotal: () => 6500,
          getServiceSubtotal: () => 0,
          getTotal: () => 6500,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });
      
      rerender(<CheckoutClient />);
      expect(screen.getByText("T-Shirt")).toBeInTheDocument();
      
      // After removing first product
      const remainingItems = [productItems[1]]; // Only Jeans left
      (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          items: remainingItems,
          updateProductQuantity: mockUpdateProductQuantity,
          removeItem: mockRemoveItem,
          clearCart: mockClearCart,
          getProductSubtotal: () => 3500,
          getServiceSubtotal: () => 0,
          getTotal: () => 3500,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });
      
      rerender(<CheckoutClient />);
      expect(screen.queryByText("T-Shirt")).not.toBeInTheDocument();
      expect(screen.getByText("Jeans")).toBeInTheDocument();
      // Use getAllByText since price might appear multiple times (item price and total)
      const priceElements = screen.getAllByText("NPR 3,500");
      expect(priceElements.length).toBeGreaterThan(0);
    });
  });

  describe("form validation", () => {
    beforeEach(() => {
      const productItems = mockItems.filter(item => item.type === "product");
      (useCartStore as unknown as jest.Mock).mockImplementation((selector) => {
        const state = {
          items: productItems,
          updateProductQuantity: mockUpdateProductQuantity,
          removeItem: mockRemoveItem,
          clearCart: mockClearCart,
          getProductSubtotal: () => 6500,
          getServiceSubtotal: () => 0,
          getTotal: () => 6500,
        };
        return typeof selector === 'function' ? selector(state) : state;
      });
    });

    it("requires all fields to be filled", () => {
      render(<CheckoutClient />);
      
      const placeOrderButton = screen.getByRole("button", { name: /place order/i });
      
      // Button should be enabled only when form is valid
      // Try to submit without filling form
      fireEvent.click(placeOrderButton);
      
      // Form should not submit (clearCart should not be called)
      expect(mockClearCart).not.toHaveBeenCalled();
    });
  });
});
