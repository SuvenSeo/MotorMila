import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Gauge, Scale, Search, Tag } from "lucide-react";
import { useAppPreferences } from "@/lib/appPreferences";
import { HOW_WE_PRICE_PATH } from "@/lib/howWePrice";

/** Guess a search query from the dead URL ("/toyota-aqua-2015" → "toyota aqua 2015"). */
export function queryFromPath(pathname: string): string {
  const last = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "");
  const words = last
    .replace(/\.(html?|php|aspx?)$/i, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 1 && !/^(listing|listings|cars?|ad|ads|item|p|id)$/i.test(w));
  return words.slice(0, 4).join(" ");
}

/** Search box + quick links for the branded 404. */
export function NotFoundSearch() {
  const { t } = useAppPreferences();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState(() => queryFromPath(pathname));

  const quick = [
    { to: "/estimate", label: t("notFound.quick.estimate", "Value my car"), icon: Gauge },
    { to: "/compare", label: t("notFound.quick.compare", "Compare cars"), icon: Scale },
    { to: "/sell", label: t("notFound.quick.sell", "Sell your car"), icon: Tag },
    { to: HOW_WE_PRICE_PATH, label: t("notFound.quick.howPrice", "How we score prices"), icon: Search },
  ];

  return (
    <div className="mb-10 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const query = q.trim();
          navigate(query ? `/?q=${encodeURIComponent(query)}#market` : "/#market");
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="nf-search" className="sr-only">
          {t("notFound.searchLabel", "Search vehicles")}
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="nf-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("notFound.searchPh", "Search make, model or year — e.g. Toyota Aqua 2015")}
            className="h-12 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        </div>
        <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-body font-semibold text-primary-foreground hover:bg-primary/90">
          {t("notFound.searchBtn", "Search")}
        </button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2">
        {quick.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-footnote font-medium text-foreground no-underline hover:border-primary/40">
              <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
