import { render, screen, fireEvent } from "@testing-library/react";
import StylistFilter from "@/components/booking/StylistFilter";

describe("StylistFilter", () => {
  it("emits onChange when selecting a specialty", () => {
    const onChange = jest.fn();
    const specialties = ["All", "Bridal Styling", "Men's Grooming"];
    render(<StylistFilter specialties={specialties} value="All" onChange={onChange} />);

    const select = screen.getByLabelText(/filter by/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "Men's Grooming" } });

    expect(onChange).toHaveBeenCalledWith("Men's Grooming");
  });
});
