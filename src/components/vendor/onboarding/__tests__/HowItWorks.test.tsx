import { render, screen } from "@testing-library/react";
import HowItWorks from "@/components/vendor/onboarding/HowItWorks";

describe("HowItWorks", () => {
  it("renders steps", () => {
    render(<HowItWorks />);
    expect(screen.getByRole("heading", { name: /how it works/i })).toBeInTheDocument();
    expect(screen.getByText(/tell us about your business/i)).toBeInTheDocument();
    expect(screen.getByText(/configure payouts/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm & submit/i)).toBeInTheDocument();
    expect(screen.getByText(/go live/i)).toBeInTheDocument();
  });
});
