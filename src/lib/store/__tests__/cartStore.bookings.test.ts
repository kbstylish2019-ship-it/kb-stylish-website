import { useCartStore } from "@/lib/store/cartStore";
import type { Booking } from "@/lib/types";

describe("cartStore bookings slice", () => {
  beforeEach(() => {
    // reset store and storage
    useCartStore.setState({ items: [] });
    localStorage.clear();
  });

  it("adds a booking and prevents duplicates", () => {
    const booking: Booking = {
      id: "bk-test-1",
      stylist: "Test Stylist",
      service: "Signature Haircut",
      date: "2025-01-01",
      time: "12:30",
      durationMins: 45,
      location: "Kathmandu",
      price: 1200,
    };

    const addBooking = useCartStore.getState().addBooking;
    const getBookingCount = useCartStore.getState().getBookingCount;
    const getServiceSubtotal = useCartStore.getState().getServiceSubtotal;
    const getItemCount = useCartStore.getState().getItemCount;

    addBooking(booking);
    addBooking(booking); // duplicate should be ignored

    const items = useCartStore.getState().items;
    expect(items.length).toBe(1);
    expect(getBookingCount()).toBe(1);
    expect(getServiceSubtotal()).toBe(1200);
    expect(getItemCount()).toBe(1);
  });

  it("removes a booking using removeItem", () => {
    const booking: Booking = {
      id: "bk-test-2",
      stylist: "A",
      service: "B",
      date: "2025-01-02",
      time: "10:00",
      durationMins: 30,
      location: "KTM",
      price: 800,
    };

    const { addBooking, removeItem } = useCartStore.getState();
    addBooking(booking);

    expect(useCartStore.getState().items.length).toBe(1);
    removeItem(booking.id);
    expect(useCartStore.getState().items.length).toBe(0);
  });
});
