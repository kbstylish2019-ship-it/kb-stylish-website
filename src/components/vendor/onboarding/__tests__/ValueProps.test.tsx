import { render, screen } from "@testing-library/react";
import ValueProps from "@/components/vendor/onboarding/ValueProps";

describe("ValueProps", () => {
  it("shows key benefits", () => {
    render(<ValueProps />);
    expect(screen.getByRole("heading", { name: /why partner with kb stylish/i })).toBeInTheDocument();
    expect(screen.getByText(/reach new customers/i)).toBeInTheDocument();
    expect(screen.getByText(/seamless payouts/i)).toBeInTheDocument();
    expect(screen.getByText(/powerful tools/i)).toBeInTheDocument();
  });
});
