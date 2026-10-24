import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Car, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageCanvas } from "@/components/PageCanvas";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppPreferences } from "@/lib/appPreferences";
import { useAuth } from "@/lib/authContext";
import { friendlyApiError } from "@/lib/apiErrorText";
import { fadeUp, listItem, listStagger, tween } from "@/lib/motion";
import {
  deleteMyListing,
  getMyListings,
  type MyListing,
} from "@/services/api";
import {
  formatPriceLkrMillions,
  formatRelativeTime,
} from "@/lib/formatting";

function humanizeStatus(status: string, t: (key: string, fallback?: string) => string): string {
  const s = status.toLowerCase();
  // Known review states get translated labels; anything else is humanized as-is.
  if (s.includes("pending") || s.includes("review")) return t("acct.profile.status.pending", "Pending review");
  if (s.includes("live") || s.includes("publish") || s.includes("approv") || s === "active") return t("acct.profile.status.live", "Live");
  if (s.includes("reject") || s.includes("declin")) return t("acct.profile.status.rejected", "Rejected");
  if (s.includes("sold")) return t("acct.profile.status.sold", "Sold");
  if (s.includes("expire")) return t("acct.profile.status.expired", "Expired");
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusTone(status: string): BadgeProps["variant"] {
  const s = status.toLowerCase();
  if (s.includes("live") || s.includes("publish") || s.includes("approv")) return "success";
  if (s.includes("reject") || s.includes("declin") || s.includes("fail")) return "danger";
  return "warning";
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
    <PageCanvas ambient="none">
      <PageHeader
        size="compact"
        eyebrow={t("profile.eyebrow", "Your profile")}
        title={t("profile.title", "My listings")}
        description={t(
          "profile.subtitle",
          "Every vehicle you've listed on Motormila, with its review status. Remove a listing any time.",
        )}
      />
      <div className="layout-shell pb-20">
        <section className="w-full max-w-3xl">
          <m.div variants={fadeUp}>
            <Card padding="sm" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 sm:p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-[12rem] flex-1">
                <p className="truncate text-body font-semibold text-foreground">
                  {user?.email ?? t("profile.signedIn", "Signed in")}
                </p>
                <div className="text-footnote text-label-2">
                  {listings === null ? (
                    <Skeleton shape="text" className="mt-1 h-3.5 w-20" />
                  ) : (
                    <span className="content-in">
                      <AnimatedNumber value={listings.length} />{" "}
                      {t("acct.profile.listingsWord", "listings")}
                    </span>
                  )}
                </div>
              </div>
              <Button asChild size="sm" className="ml-auto shrink-0">
                <Link to="/sell">
                  <Plus aria-hidden />
                  {t("profile.newListing", "List a vehicle")}
                </Link>
              </Button>
            </Card>
          </m.div>

          {listings === null ? (
            <div className="space-y-3" aria-busy="true" aria-label={t("profile.loading", "Loading your listings…")}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[7.5rem] w-full" />
              ))}
            </div>
          ) : error ? (
            <Card padding="none">
              <ErrorState
                title={t("profile.loadFailed", "Couldn't load your listings.")}
                body={friendlyApiError(error, t("profile.loadFailedBody", "Something went wrong on our side. Try again in a moment."), t)}
                onRetry={() => {
                  setListings(null);
                  void load();
                }}
                retryLabel={t("profile.retry", "Try again")}
              />
            </Card>
          ) : listings.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={Car}
                title={t("profile.emptyTitle", "No listings yet")}
                body={t(
                  "profile.emptyBody",
                  "List your first vehicle — it's free, and your ad goes live after a quick review.",
                )}
                action={
                  <Button asChild>
                    <Link to="/sell">
                      <Plus aria-hidden />
                      {t("profile.emptyCta", "Sell your car")}
                    </Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <m.ul className="content-in space-y-3" variants={listStagger} initial="hidden" animate="show">
              <AnimatePresence initial={false}>
                {listings.map((l, i) => (
                  <m.li key={l.id} layout variants={listItem} custom={i} exit={{ opacity: 0, scale: 0.98, transition: tween.exit }}>
                    <Card padding="sm" className="sm:p-5">
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-body font-semibold text-foreground">{listingTitle(l)}</h3>
                            <Badge variant={statusTone(l.status)}>{humanizeStatus(l.status, t)}</Badge>
                          </div>
                          <p className="mt-1.5 text-footnote text-label-2">
                            {[l.year, l.fuelType, l.transmission, l.district].filter(Boolean).join(" · ")}
                            {l.createdAt && (
                              <> · {t("profile.listed", "listed")} {formatRelativeTime(l.createdAt)}</>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="text-body font-semibold tabular-nums text-foreground">
                            {formatPriceLkrMillions(l.priceLkr)}
                          </p>
                          {confirmId !== l.id ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="-mr-2 text-label-2 hover:text-deal-high-text"
                              onClick={() => setConfirmId(l.id)}
                            >
                              <Trash2 aria-hidden />
                              {t("profile.delete", "Delete")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {confirmId === l.id ? (
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          <span className="text-footnote text-label-2">{t("profile.confirmDelete", "Delete this listing?")}</span>
                          <Button size="sm" variant="destructive" loading={deletingId === l.id} onClick={() => void handleDelete(l.id)}>
                            <Trash2 aria-hidden />
                            {t("profile.confirmYes", "Yes, delete")}
                          </Button>
                          <Button size="sm" variant="secondary" disabled={deletingId === l.id} onClick={() => setConfirmId(null)}>
                            {t("profile.confirmNo", "Keep it")}
                          </Button>
                        </div>
                      ) : null}
                    </Card>
                  </m.li>
                ))}
              </AnimatePresence>
            </m.ul>
          )}
        </section>
      </div>
    </PageCanvas>
  );
}
