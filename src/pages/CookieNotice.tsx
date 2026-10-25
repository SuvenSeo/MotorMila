import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LegalPageShell, LegalSection, PRIVACY_EMAIL } from "@/components/money/LegalPageShell";

const ITEMS: { name: string; kind: string; purpose: string; lasts: string }[] = [
  { name: "mm_session", kind: "Cookie (essential)", purpose: "Keeps you signed in.", lasts: "Until you sign out, or up to 24 hours" },
  { name: "motormila.auth_*", kind: "Local storage (essential)", purpose: "Remembers your signed-in session in the app.", lasts: "Until you sign out" },
  { name: "Theme, language, font", kind: "Local storage (preference)", purpose: "Remembers your display choices.", lasts: "Until you clear it" },
  { name: "Analytics session ID", kind: "Session storage (analytics)", purpose: "Groups page views in one visit, so we can see which features are used. It isn't linked to your name.", lasts: "Until you close the tab" },
  { name: "Vercel Web Analytics", kind: "No cookie", purpose: "Counts page views without cookies or cross-site tracking.", lasts: "Not stored on your device" },
];

export default function CookieNotice() {
  return (
    <LegalPageShell icon={Cookie} title="Cookie notice" description="What MotorMila stores in your browser, and why.">
      <LegalSection title="What we use">
        <p>
          MotorMila uses a small number of cookies and browser storage items. We don't use advertising cookies, and we
          don't let ad networks track you across sites.
        </p>
        {/* Phones: one card per item, so no column is cut off behind a sideways scroll. */}
        <dl className="space-y-3 sm:hidden">
          {ITEMS.map((item) => (
            <div key={item.name} className="rounded-card border border-border bg-surface-1 p-4 shadow-e1">
              <dt className="text-body font-semibold text-foreground">{item.name}</dt>
              <dd className="mt-0.5 text-footnote text-label-2">{item.kind}</dd>
              <dd className="mt-2 text-footnote text-label-1">{item.purpose}</dd>
              <dd className="mt-1 text-footnote text-label-2">{item.lasts}</dd>
            </div>
          ))}
        </dl>
        <TableContainer className="hidden shadow-e1 sm:block">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Why</TableHead>
                <TableHead>How long</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ITEMS.map((item) => (
                <TableRow key={item.name} className="align-top">
                  <TableCell className="font-semibold">{item.name}</TableCell>
                  <TableCell className="text-label-2">{item.kind}</TableCell>
                  <TableCell>{item.purpose}</TableCell>
                  <TableCell className="text-label-2">{item.lasts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </LegalSection>
      <LegalSection title="Your choices">
        <p>
          You can clear or block cookies and site data in your browser settings. If you block essential items you
          won't be able to stay signed in. When you pay through PayHere, PayHere's own cookies apply on its pages.
        </p>
        <p>
          More detail is in our <Link to="/privacy">Privacy Policy</Link>. Questions:{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
