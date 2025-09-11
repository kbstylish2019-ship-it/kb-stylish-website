import { renderHook, act } from "@testing-library/react";
import { useVendorOnboarding } from "@/hooks/useVendorOnboarding";

describe("useVendorOnboarding", () => {
  it("initializes with correct defaults", () => {
    const { result } = renderHook(() => useVendorOnboarding());
    
    expect(result.current.currentStep).toBe(1);
    expect(result.current.business.businessName).toBe("");
    expect(result.current.business.businessType).toBe("Boutique");
    expect(result.current.payout.method).toBe("bank");
    expect(result.current.consent).toBe(false);
    expect(result.current.submitted).toBe(false);
    expect(result.current.canGoNext).toBe(false);
  });

  it("validates step 1 correctly", () => {
    const { result } = renderHook(() => useVendorOnboarding());
    
    // Invalid initially
    expect(result.current.canGoNext).toBe(false);
    
    // Fill required fields
    act(() => {
      result.current.updateBusiness({
        businessName: "Test Business",
        contactName: "John Doe",
        email: "john@test.com",
        phone: "9800000000",
      });
    });
    
    expect(result.current.canGoNext).toBe(true);
  });

  it("handles step navigation", () => {
    const { result } = renderHook(() => useVendorOnboarding());
    
    // Fill step 1
    act(() => {
      result.current.updateBusiness({
        businessName: "Test Business",
        contactName: "John Doe", 
        email: "john@test.com",
        phone: "9800000000",
      });
    });
    
    // Go to step 2
    act(() => {
      result.current.goNext();
    });
    
    expect(result.current.currentStep).toBe(2);
    
    // Go back
    act(() => {
      result.current.goPrev();
    });
    
    expect(result.current.currentStep).toBe(1);
  });

  it("handles payout method switching", () => {
    const { result } = renderHook(() => useVendorOnboarding());
    
    act(() => {
      result.current.updatePayoutMethod("esewa");
    });
    
    expect(result.current.payout.method).toBe("esewa");
    expect((result.current.payout as any).esewaId).toBe("");
  });

  it("submits application with console log", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const onSubmit = jest.fn();
    const { result } = renderHook(() => useVendorOnboarding());
    
    // Fill all required data
    act(() => {
      result.current.updateBusiness({
        businessName: "Test Business",
        contactName: "John Doe",
        email: "john@test.com", 
        phone: "9800000000",
      });
    });
    
    act(() => {
      result.current.updatePayout({
        bankName: "Test Bank",
        accountName: "Test Account",
        accountNumber: "123456789",
      });
    });
    
    act(() => {
      result.current.updateConsent(true);
    });
    
    await act(async () => {
      await result.current.submitApplication(onSubmit);
    });
    
    expect(consoleSpy).toHaveBeenCalledWith("Vendor Application Submitted:", expect.any(Object));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(result.current.submitted).toBe(true);
    
    consoleSpy.mockRestore();
  });
});
