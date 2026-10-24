import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Gauge, Scale, Search, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <Card>
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
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-label-2" aria-hidden />
          <Input
            id="nf-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("notFound.searchPh", "Search make, model or year — e.g. Toyota Aqua 2015")}
            className="h-12 pl-10"
          />
        </div>
        <Button type="submit" size="lg">
          {t("notFound.searchBtn", "Search")}
        </Button>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2">
        {quick.map(({ to, label, icon: Icon }) => (
          <li key={to} className="max-w-full">
            <Button asChild variant="secondary" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-1.5 text-center font-medium">
              <Link to={to} className="no-underline">
                <Icon className="text-primary" aria-hidden />
                {label}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
