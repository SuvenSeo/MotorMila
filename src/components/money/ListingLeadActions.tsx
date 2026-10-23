import { useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, ClipboardCheck, ShieldCheck } from "lucide-react";
import { LeadRequestForm } from "./LeadRequestForm";
import { LEAD_COPY, type LeadKind } from "@/lib/leadConsent";

const TABS: { kind: LeadKind; label: string; icon: typeof Banknote }[] = [
  { kind: "finance", label: "Leasing quote", icon: Banknote },
  { kind: "inspection", label: "Inspection", icon: ClipboardCheck },
  { kind: "insurance", label: "Insurance", icon: ShieldCheck },
];

/** "Next steps" card on a listing: leasing quote, inspection, insurance quote. */
export function ListingLeadActions({
  listingId,
  vehicle,
  priceLkr,
  district,
}: {
  listingId?: number;
  vehicle?: string;
  priceLkr?: number;
  district?: string;
}) {
  const [kind, setKind] = useState<LeadKind | null>(null);
  return (
    <section aria-labelledby="listing-next-steps" className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
      <h2 id="listing-next-steps" className="text-caption font-semibold text-muted-foreground">Next steps for this vehicle</h2>
      <div role="tablist" aria-label="Request type" className="mt-3 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            aria-selected={kind === tab.kind}
            onClick={() => setKind(kind === tab.kind ? null : tab.kind)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-caption font-semibold transition-colors ${
              kind === tab.kind ? "border-primary/40 bg-primary/10 text-primary-bright" : "border-border bg-surface text-foreground hover:border-primary/30"
            }`}
          >
            <tab.icon aria-hidden className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>
      {kind && (
        <div role="tabpanel" className="mt-4">
          <h3 className="mb-1 text-body font-bold text-foreground">{LEAD_COPY[kind].title}</h3>
          <LeadRequestForm
            key={kind}
            kind={kind}
            compact
            listing={{ id: listingId, vehicle, priceLkr, district }}
          />
        </div>
      )}
      <p className="mt-4 text-caption text-muted-foreground">
        Is this your ad, or does it show your details?{" "}
        <Link
          to={`/removal?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
          className="underline underline-offset-2"
        >
          Ask us to remove it
        </Link>
        .
      </p>
    </section>
  );
}

export default ListingLeadActions;
