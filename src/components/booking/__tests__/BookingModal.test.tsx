import { render, screen, fireEvent, within } from "@testing-library/react";
import BookingModal from "@/components/booking/BookingModal";
import { useCartStore } from "@/lib/store/cartStore";
import type { StylistProfile } from "@/lib/mock/stylists";

const stylist: StylistProfile = {
  id: "s-test",
  name: "Tester",
  specialty: "Grooming",
  rating: 4.5,
  location: "Kathmandu",
  services: [
    { name: "Service A", durationMins: 30, price: 500 },
    { name: "Service B", durationMins: 60, price: 1000 },
  ],
};

describe("BookingModal", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
    localStorage.clear();
  });

  it("adds a booking to cart on confirm", () => {
    const onClose = jest.fn();
    render(<BookingModal stylist={stylist} open={true} onClose={onClose} />);

    // Pick first service
    const serviceList = screen.getByTestId("service-list");
    const serviceOption = within(serviceList).getByText(/Service A/i).closest("label")!;
    fireEvent.click(serviceOption);

    // Pick first date
    const dateGrid = screen.getByTestId("date-grid");
    const firstDateBtn = within(dateGrid).getAllByRole("button")[0];
    fireEvent.click(firstDateBtn);

    // Pick first time
    const timeGrid = screen.getByTestId("time-grid");
    const firstTimeBtn = within(timeGrid).getAllByRole("button")[0];
    fireEvent.click(firstTimeBtn);

    // Confirm
    const confirmBtn = screen.getByRole("button", { name: /confirm & add to cart/i });
    fireEvent.click(confirmBtn);

    const items = useCartStore.getState().items;
    expect(items.length).toBe(1);
    expect(items[0].type).toBe("booking");
    expect(onClose).toHaveBeenCalled();
  });
});
