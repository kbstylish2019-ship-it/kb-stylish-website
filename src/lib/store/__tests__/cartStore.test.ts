import { act, renderHook } from "@testing-library/react";
import { useCartStore } from "../cartStore";
import type { Booking } from "@/lib/types";

describe("cartStore", () => {
  beforeEach(() => {
    // Clear store before each test
    const { result } = renderHook(() => useCartStore());
    act(() => {
      result.current.clearCart();
    });
  });

  describe("Product Operations", () => {
    it("should add a new product to cart", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          variant: "Red",
          price: 1000,
          quantity: 2,
        });
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]).toMatchObject({
        type: "product",
        id: "prod-1",
        name: "Test Product",
        variant: "Red",
        price: 1000,
        quantity: 2,
      });
    });

    it("should increment quantity when adding existing product", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          variant: "Red",
          price: 1000,
          quantity: 1,
        });
      });

      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          variant: "Red",
          price: 1000,
          quantity: 2,
        });
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]).toMatchObject({
        quantity: 3,
      });
    });

    it("should treat different variants as separate items", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          variant: "Red",
          price: 1000,
        });
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          variant: "Blue",
          price: 1000,
        });
      });

      expect(result.current.items).toHaveLength(2);
    });

    it("should update product quantity", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          variant: "Red",
          price: 1000,
          quantity: 2,
        });
      });

      act(() => {
        result.current.updateProductQuantity("prod-1", 5, "Red");
      });

      expect(result.current.items[0]).toMatchObject({
        quantity: 5,
      });
    });

    it("should remove product when quantity is set to 0", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          price: 1000,
        });
      });

      act(() => {
        result.current.updateProductQuantity("prod-1", 0);
      });

      expect(result.current.items).toHaveLength(0);
    });

    it("should increment and decrement product quantity", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          price: 1000,
          quantity: 2,
        });
      });

      act(() => {
        result.current.incrementProductQuantity("prod-1");
      });
      expect(result.current.items[0]).toMatchObject({ quantity: 3 });

      act(() => {
        result.current.decrementProductQuantity("prod-1");
      });
      expect(result.current.items[0]).toMatchObject({ quantity: 2 });
    });

    it("should not decrement quantity below 1", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Test Product",
          price: 1000,
          quantity: 1,
        });
      });

      act(() => {
        result.current.decrementProductQuantity("prod-1");
      });

      expect(result.current.items[0]).toMatchObject({ quantity: 1 });
    });
  });

  describe("Booking Operations", () => {
    const mockBooking: Booking = {
      id: "book-1",
      serviceType: "Hair Treatment",
      serviceName: "Premium Hair Spa",
      date: "2024-01-15",
      time: "10:00 AM",
      price: 2500,
      vendorName: "KB Stylish Salon",
      status: "confirmed",
    };

    it("should add a booking to cart", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addBooking(mockBooking);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]).toMatchObject({
        type: "booking",
        booking: mockBooking,
      });
    });

    it("should not add duplicate bookings", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addBooking(mockBooking);
        result.current.addBooking(mockBooking);
      });

      expect(result.current.items).toHaveLength(1);
    });

    it("should remove booking by id", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addBooking(mockBooking);
      });

      act(() => {
        result.current.removeItem("book-1");
      });

      expect(result.current.items).toHaveLength(0);
    });
  });

  describe("Mixed Cart Operations", () => {
    it("should handle both products and bookings", () => {
      const { result } = renderHook(() => useCartStore());
      const booking: Booking = {
        id: "book-1",
        serviceType: "Hair Treatment",
        serviceName: "Premium Hair Spa",
        date: "2024-01-15",
        time: "10:00 AM",
        price: 2500,
        vendorName: "KB Stylish Salon",
        status: "confirmed",
      };

      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Shampoo",
          price: 500,
        });
        result.current.addBooking(booking);
        result.current.addProduct({
          id: "prod-2",
          name: "Hair Oil",
          price: 750,
        });
      });

      expect(result.current.items).toHaveLength(3);
      expect(result.current.getProductCount()).toBe(2);
      expect(result.current.getBookingCount()).toBe(1);
    });

    it("should clear all items from cart", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Product 1",
          price: 1000,
        });
        result.current.addBooking({
          id: "book-1",
          serviceType: "Service",
          serviceName: "Test Service",
          date: "2024-01-15",
          time: "10:00 AM",
          price: 2000,
          vendorName: "Vendor",
          status: "confirmed",
        });
      });

      act(() => {
        result.current.clearCart();
      });

      expect(result.current.items).toHaveLength(0);
    });
  });

  describe("Selectors", () => {
    beforeEach(() => {
      const { result } = renderHook(() => useCartStore());
      act(() => {
        result.current.clearCart();
        result.current.addProduct({
          id: "prod-1",
          name: "Product 1",
          price: 1000,
          quantity: 2,
        });
        result.current.addProduct({
          id: "prod-2",
          name: "Product 2",
          price: 500,
          quantity: 1,
        });
        result.current.addBooking({
          id: "book-1",
          serviceType: "Service",
          serviceName: "Test Service",
          date: "2024-01-15",
          time: "10:00 AM",
          price: 3000,
          vendorName: "Vendor",
          status: "confirmed",
        });
      });
    });

    it("should calculate correct item count", () => {
      const { result } = renderHook(() => useCartStore());
      expect(result.current.getItemCount()).toBe(4); // 2 + 1 + 1
    });

    it("should calculate correct product count", () => {
      const { result } = renderHook(() => useCartStore());
      expect(result.current.getProductCount()).toBe(3); // 2 + 1
    });

    it("should calculate correct booking count", () => {
      const { result } = renderHook(() => useCartStore());
      expect(result.current.getBookingCount()).toBe(1);
    });

    it("should calculate correct product subtotal", () => {
      const { result } = renderHook(() => useCartStore());
      expect(result.current.getProductSubtotal()).toBe(2500); // (1000 * 2) + (500 * 1)
    });

    it("should calculate correct service subtotal", () => {
      const { result } = renderHook(() => useCartStore());
      expect(result.current.getServiceSubtotal()).toBe(3000);
    });

    it("should calculate correct total", () => {
      const { result } = renderHook(() => useCartStore());
      expect(result.current.getTotal()).toBe(5500); // 2500 + 3000
    });

    it("should find product item by id and variant", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-3",
          name: "Product 3",
          variant: "Red",
          price: 800,
        });
      });

      const found = result.current.findProductItem("prod-3", "Red");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Product 3");
      expect(found?.variant).toBe("Red");

      const notFound = result.current.findProductItem("prod-3", "Blue");
      expect(notFound).toBeUndefined();
    });

    it("should find booking item by id", () => {
      const { result } = renderHook(() => useCartStore());
      
      const found = result.current.findBookingItem("book-1");
      expect(found).toBeDefined();
      expect(found?.booking.id).toBe("book-1");

      const notFound = result.current.findBookingItem("book-999");
      expect(notFound).toBeUndefined();
    });
  });

  describe("Remove Operations", () => {
    it("should remove product by id and variant", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Product",
          variant: "Red",
          price: 1000,
        });
        result.current.addProduct({
          id: "prod-1",
          name: "Product",
          variant: "Blue",
          price: 1000,
        });
      });

      act(() => {
        result.current.removeItem("prod-1", "Red");
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]).toMatchObject({
        id: "prod-1",
        variant: "Blue",
      });
    });

    it("should remove product without variant", () => {
      const { result } = renderHook(() => useCartStore());
      
      act(() => {
        result.current.addProduct({
          id: "prod-1",
          name: "Product",
          price: 1000,
        });
      });

      act(() => {
        result.current.removeItem("prod-1");
      });

      expect(result.current.items).toHaveLength(0);
    });
  });
});
