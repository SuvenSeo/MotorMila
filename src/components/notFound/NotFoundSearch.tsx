import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Gauge, Scale, Search, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const query = q.trim();
          navigate(query ? `/?q=${encodeURIComponent(query)}#market` : "/#market");
        }}
        className="cine-field flex items-center gap-2 p-1.5 pl-4"
      >
        <label htmlFor="nf-search" className="sr-only">
          {t("notFound.searchLabel", "Search vehicles")}
        </label>
        <Search className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
        <input
          id="nf-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("notFound.searchPh", "Search make, model or year — e.g. Toyota Aqua 2015")}
          className="h-11 min-w-0 flex-1 bg-transparent text-body text-white placeholder:text-white/45 focus:outline-none"
        />
        <Button type="submit" size="md" className="h-11 shrink-0 px-5">
          {t("notFound.searchBtn", "Search")}
        </Button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2">
        {quick.map(({ to, label, icon: Icon }) => (
          <li key={to} className="max-w-full">
            <Link
              to={to}
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-footnote font-medium text-white/85 no-underline transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-[hsl(213_100%_70%)]" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
