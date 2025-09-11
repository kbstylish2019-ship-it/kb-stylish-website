import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ApplicationForm from "@/components/vendor/onboarding/ApplicationForm";

function fillStep1() {
  fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "KB Signature Studio" } });
  fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: "Boutique" } });
  fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: "Anisha Gurung" } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "owner@kb.com" } });
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "9800000000" } });
}

function fillBankPayout() {
  fireEvent.change(screen.getByLabelText(/bank name/i), { target: { value: "Nabil Bank" } });
  fireEvent.change(screen.getByLabelText(/account name/i), { target: { value: "KB Stylish Pvt Ltd" } });
  fireEvent.change(screen.getByLabelText(/account number/i), { target: { value: "0123456789" } });
}

describe("ApplicationForm", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("validates steps and submits application", async () => {
    const onSubmit = jest.fn();
    render(<ApplicationForm onSubmit={onSubmit} />);

    // Step 1: attempt next shows errors
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/business name is required/i)).toBeInTheDocument();

    // Fill step 1
    fillStep1();
    
    // Wait for validation to clear errors
    await waitFor(() => {
      const nextButton = screen.getByRole("button", { name: /next/i });
      expect(nextButton).not.toBeDisabled();
    });
    
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2
    expect(screen.getByTestId("step-2")).toBeInTheDocument();
    fillBankPayout();
    
    await waitFor(() => {
      const nextButton = screen.getByRole("button", { name: /next/i });
      expect(nextButton).not.toBeDisabled();
    });
    
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 3
    expect(screen.getByTestId("step-3")).toBeInTheDocument();
    
    // Try to submit without consent
    fireEvent.click(screen.getByTestId("submit-application"));
    expect(screen.getByText(/you must agree to the terms/i)).toBeInTheDocument();

    // Give consent and submit
    fireEvent.click(screen.getByLabelText(/i agree to the platform terms/i));
    
    await waitFor(() => {
      const submitButton = screen.getByTestId("submit-application");
      expect(submitButton).not.toBeDisabled();
    });
    
    fireEvent.click(screen.getByTestId("submit-application"));

    // Success UI + callback
    await waitFor(() => {
      expect(screen.getByTestId("application-success")).toBeInTheDocument();
    });
    
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.business.businessName).toBe("KB Signature Studio");
    expect(payload.payout.method).toBe("bank");
    expect(payload.consent).toBe(true);
  });

  it("handles payout method switching", () => {
    render(<ApplicationForm />);
    
    // Fill step 1 to get to step 2
    fillStep1();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    
    // Switch to eSewa
    fireEvent.click(screen.getByRole("button", { name: /esewa/i }));
    expect(screen.getByLabelText(/esewa id/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/bank name/i)).not.toBeInTheDocument();
    
    // Switch to Khalti
    fireEvent.click(screen.getByRole("button", { name: /khalti/i }));
    expect(screen.getByLabelText(/khalti id/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/esewa id/i)).not.toBeInTheDocument();
  });
});
