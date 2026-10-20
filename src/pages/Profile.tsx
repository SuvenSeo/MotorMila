import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Car,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { PageBody } from "@/components/PageBody";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { revealContainer, revealItem } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  deleteMyListing,
  getMyListings,
  type MyListing,
} from "@/services/api";
import {
  formatPriceLkrMillions,
  formatRelativeTime,
} from "@/lib/formatting";

function humanizeStatus(status: string): string {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("live") || s.includes("publish") || s.includes("approv"))
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (s.includes("reject") || s.includes("declin") || s.includes("fail"))
    return "border-red-400/30 bg-red-400/10 text-red-300";
  return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

function listingTitle(l: MyListing): string {
  if (l.title) return l.title;
  return [l.make, l.model, l.year].filter(Boolean).join(" ");
}

export default function Profile() {
  const { t } = useAppPreferences();
  const { user } = useAuth();
  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // The API soft-deletes (marks status "removed" and keeps history);
      // the profile only shows listings the user can still manage.
      const all = await getMyListings();
      setListings(all.filter((l) => l.status.toLowerCase() !== "removed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setListings([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: number) => {
      setDeletingId(id);
      try {
        await deleteMyListing(id);
        setListings((prev) => (prev ? prev.filter((l) => l.id !== id) : prev));
        setConfirmId(null);
        toast.success(t("profile.deleted", "Listing deleted."));
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : t("profile.deleteFailed", "Could not delete the listing."),
        );
      } finally {
        setDeletingId(null);
      }
    },
    [t],
  );

  return (
    <PageCanvas>
      <PageHero
        eyebrow={t("profile.eyebrow", "Your profile")}
        title={t("profile.title", "My listings")}
        description={t(
          "profile.subtitle",
          "Every vehicle you've listed on Motormila, with its review status. Remove a listing any time.",
        )}
      />
      <PageBody>
        <motion.section
          variants={revealContainer}
          initial="hidden"
          animate="show"
          className="mx-auto w-full max-w-3xl"
        >
          <motion.div
            variants={revealItem}
            className="liquid-panel mb-6 flex items-center gap-4 rounded-2xl p-5"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
              <UserRound className="h-5 w-5 text-primary-bright" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {user?.email ?? t("profile.signedIn", "Signed in")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("profile.listingCount", "{count} listings").replace(
                  "{count}",
                  String(listings?.length ?? 0),
                )}
              </p>
            </div>
            <Button asChild variant="default" size="sm" className="ml-auto shrink-0">
              <Link to="/sell">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                {t("profile.newListing", "List a vehicle")}
              </Link>
            </Button>
          </motion.div>

          {listings === null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("profile.loading", "Loading your listings…")}
            </div>
          ) : error ? (
            <div className="liquid-panel rounded-2xl p-8 text-center">
              <TriangleAlert className="mx-auto h-8 w-8 text-amber-300" aria-hidden />
              <p className="mt-3 text-sm text-foreground">
                {t("profile.loadFailed", "Couldn't load your listings.")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <Button onClick={() => void load()} variant="outline" size="sm" className="mt-4">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {t("profile.retry", "Try again")}
              </Button>
            </div>
          ) : listings.length === 0 ? (
            <div className="liquid-panel rounded-2xl p-10 text-center">
              <Car className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="mt-4 text-sm font-semibold text-foreground">
                {t("profile.emptyTitle", "No listings yet")}
              </p>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                {t(
                  "profile.emptyBody",
                  "List your first vehicle — it's free, and your ad goes live after a quick review.",
                )}
              </p>
              <Button asChild variant="default" size="sm" className="mt-5">
                <Link to="/sell">
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                  {t("profile.emptyCta", "Sell your car")}
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {listings.map((l) => (
                <motion.li
                  key={l.id}
                  variants={revealItem}
                  className="liquid-panel rounded-2xl p-5"
                >
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {listingTitle(l)}
                        </h3>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            statusTone(l.status),
                          )}
                        >
                          {humanizeStatus(l.status)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {[l.year, l.fuelType, l.transmission, l.district]
                          .filter(Boolean)
                          .join(" · ")}
                        {l.createdAt && (
                          <> · {t("profile.listed", "listed")} {formatRelativeTime(l.createdAt)}</>
                        )}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">
                      {formatPriceLkrMillions(l.priceLkr)}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    {confirmId === l.id ? (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {t("profile.confirmDelete", "Delete this listing?")}
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deletingId === l.id}
                          onClick={() => void handleDelete(l.id)}
                        >
                          {deletingId === l.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          )}
                          {t("profile.confirmYes", "Yes, delete")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deletingId === l.id}
                          onClick={() => setConfirmId(null)}
                        >
                          {t("profile.confirmNo", "Keep it")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-red-300"
                        onClick={() => setConfirmId(l.id)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        {t("profile.delete", "Delete")}
                      </Button>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.section>
      </PageBody>
    </PageCanvas>
  );
}
