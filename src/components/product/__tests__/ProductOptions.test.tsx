import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductOptions, { type Selection } from "@/components/product/ProductOptions";
import type { ProductOption, ProductVariant } from "@/lib/types";

describe("ProductOptions", () => {
  const options: ProductOption[] = [
    { id: "size", name: "Size", values: ["S", "M", "L"] },
    { id: "color", name: "Color", values: ["Black", "Purple"] },
  ];

  const variants: ProductVariant[] = [
    { id: "1", options: { Size: "S", Color: "Black" }, price: 1000, stock: 3 },
    { id: "2", options: { Size: "M", Color: "Black" }, price: 1000, stock: 0 },
    { id: "3", options: { Size: "L", Color: "Purple" }, price: 1000, stock: 5 },
  ];

  it("disables unavailable combinations", () => {
    const selection: Selection = { Size: "S", Color: undefined };
    render(
      <ProductOptions options={options} variants={variants} selection={selection} onChange={() => {}} />
    );
    // With Size S selected, only Black should be enabled
    const purpleBtn = screen.getByTestId("opt-Color-Purple");
    const blackBtn = screen.getByTestId("opt-Color-Black");
    expect(purpleBtn).toBeDisabled();
    expect(blackBtn).toBeEnabled();
  });

  it("calls onChange when selecting a value", () => {
    const selection: Selection = { Size: undefined, Color: undefined };
    const onChange = jest.fn();
    render(<ProductOptions options={options} variants={variants} selection={selection} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("opt-Size-S"));
    expect(onChange).toHaveBeenCalledWith({ Size: "S", Color: undefined });
  });
});
