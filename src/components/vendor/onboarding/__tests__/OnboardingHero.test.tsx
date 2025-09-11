import { render, screen } from "@testing-library/react";
import OnboardingHero from "@/components/vendor/onboarding/OnboardingHero";

describe("OnboardingHero", () => {
  it("renders headline and CTA", () => {
    render(<OnboardingHero />);
    expect(
      screen.getByText("Partner with Nepal's Premier Style Platform")
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /start your application/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "#apply");
  });
});
