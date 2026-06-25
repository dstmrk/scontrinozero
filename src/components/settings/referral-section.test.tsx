import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReferralSection } from "./referral-section";

describe("ReferralSection", () => {
  it("mostra il codice referral dell'utente", () => {
    render(<ReferralSection referralCode="AB2CDEFG" completedReferrals={0} />);
    expect(screen.getByText("AB2CDEFG")).toBeInTheDocument();
  });

  it("mostra il bottone di condivisione con label custom per il referral", () => {
    render(<ReferralSection referralCode="AB2CDEFG" completedReferrals={0} />);
    expect(screen.getByText("Condividi codice referral")).toBeInTheDocument();
  });

  it("non mostra il contatore referral completati quando è zero", () => {
    render(<ReferralSection referralCode="AB2CDEFG" completedReferrals={0} />);
    expect(screen.queryByText(/Referral completati/)).not.toBeInTheDocument();
  });

  it("mostra il contatore referral completati quando maggiore di zero", () => {
    render(<ReferralSection referralCode="AB2CDEFG" completedReferrals={3} />);
    expect(screen.getByText("Referral completati: 3")).toBeInTheDocument();
  });
});
