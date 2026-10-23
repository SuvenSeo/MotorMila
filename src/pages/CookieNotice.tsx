import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
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
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[560px] text-left text-caption">
            <thead className="bg-surface">
              <tr>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Why</th>
                <th className="px-3 py-2 font-semibold">How long</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((item) => (
                <tr key={item.name} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-semibold text-foreground">{item.name}</td>
                  <td className="px-3 py-2">{item.kind}</td>
                  <td className="px-3 py-2">{item.purpose}</td>
                  <td className="px-3 py-2">{item.lasts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
