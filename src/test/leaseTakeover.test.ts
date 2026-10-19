import { describe, expect, it } from "vitest";
import {
  detectLeaseTakeover,
  detectListingLeaseTakeover,
  isLeaseTakeoverListing,
} from "@/lib/leaseTakeover";

describe("detectLeaseTakeover", () => {
  it.each([
    "Toyota Vitz 2018 lease takeover",
    "Lease take over - Honda Vezel",
    "LEASING TAKE-OVER urgent",
    "Lease transfer possible, call now",
    "Peugeot 2008 - takeover only",
    "Can be taken over by continuing the existing lease",
    "Lease settle karala ganna puluwan",
    "Buyer has to settle the lease",
    "Lease settlement 2.1M remaining",
    "Rs. 9,300,000 (Ongoing Lease)",
    "Continue the lease with the bank",
    "Balance 24 installments to pay",
    "balance of the instalments with LB Finance",
    "Remaining 18 installments",
    "Leasing 199,000*59",
  ])("flags %s", (text) => {
    expect(detectLeaseTakeover(text).isLeaseTakeover).toBe(true);
  });

  it.each([
    "Leasing can be arranged within one day",
    "Lease facilities available",
    "Leasing available up to 60%",
    "Lease fully settled, clear CR",
    "Lease settled. Original book in hand",
    "No lease, cash buyers only",
    "Toyota Aqua 2017, 1st owner, service records",
    "",
  ])("ignores %s", (text) => {
    expect(detectLeaseTakeover(text).isLeaseTakeover).toBe(false);
  });

  it("does not let an innocent phrase mask a real takeover in the same ad", () => {
    const r = detectLeaseTakeover("Leasing can be arranged. Or lease takeover 45,000 x 36.");
    expect(r.isLeaseTakeover).toBe(true);
  });

  it("extracts monthly instalment and months remaining when stated", () => {
    const r = detectLeaseTakeover("Leasing 199,000*59 — takeover");
    expect(r.monthlyLkr).toBe(199_000);
    expect(r.monthsRemaining).toBe(59);
    expect(r.matched).toBeTruthy();
  });

  it("rejects implausible instalment terms", () => {
    const r = detectLeaseTakeover("lease takeover 2015 x 300");
    expect(r.isLeaseTakeover).toBe(true);
    expect(r.monthlyLkr).toBeNull();
    expect(r.monthsRemaining).toBeNull();
  });

  it("accepts arrays and nullish parts", () => {
    expect(detectLeaseTakeover([null, undefined, "ongoing lease"]).isLeaseTakeover).toBe(true);
    expect(detectLeaseTakeover(null).isLeaseTakeover).toBe(false);
  });
});

describe("listing wrappers", () => {
  it("reads title, variant and description", () => {
    expect(isLeaseTakeoverListing({ title: "Honda Fit", description: "Lease takeover, balance 30 installments" })).toBe(true);
    expect(isLeaseTakeoverListing({ title: "Honda Fit GP5", variant: "takeover" })).toBe(true);
    expect(isLeaseTakeoverListing({ title: "Honda Fit GP5", description: "Leasing can be arranged" })).toBe(false);
    expect(detectListingLeaseTakeover(undefined).isLeaseTakeover).toBe(false);
  });
});
