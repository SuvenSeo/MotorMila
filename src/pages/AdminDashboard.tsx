import { FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Car,
  Check,
  Copy,
  Crown,
  Database,
  ExternalLink,
  LifeBuoy,
  MailPlus,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles,
  Store,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  clearAdminStatsCache,
  createAdminInvite,
  getAdminAnalytics,
  getAdminDealers,
  getAdminFeedback,
  getAdminInvites,
  getAdminOverview,
  getAdminPermits,
  getAdminPipeline,
  getAdminSystem,
  getAdminUsers,
  revokeAdminInvite,
  runRevcarDataPilot,
  triggerAdminPipeline,
  updateAdminFeedback,
  updateAdminUser,
  upsertAdminPermit,
  verifyAdminDealer,
  type AdminInvite,
  type AdminUser,
} from "@/services/api";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { revealContainer, revealItem } from "@/lib/motion";
import { BRAND } from "@/lib/brand";
import { useAppPreferences } from "@/lib/appPreferences";

type AdminTab =
  | "overview"
  | "users"
  | "invites"
  | "pipeline"
  | "analytics"
  | "feedback"
  | "dealers"
  | "permits"
  | "system";

const TAB_IDS: AdminTab[] = [
  "overview",
  "users",
  "invites",
  "pipeline",
  "analytics",
  "feedback",
  "dealers",
  "permits",
  "system",
];

function formatCount(value: number | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatPrice(value: number | undefined) {
  return `Rs ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function providerStatusLabel(provider: {
  enabled: boolean;
  configured: boolean;
  lastRun?: { status?: string | null } | null;
}) {
  if (!provider.enabled) return "flagged off";
  if (!provider.configured) return "needs key";
  const status = provider.lastRun?.status;
  if (!status) return "ready · no runs yet";
  return status;
}

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
}) {
  return (
    <div className="metric-tile group p-5 transition-all hover:-translate-y-0.5 hover:border-primary/25">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tech-label text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-[1.85rem] font-semibold tracking-tight text-foreground num">
            {value}
          </p>
          {hint ? <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 transition-colors group-hover:border-primary/30">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function StatBars({
  rows,
  labelKey,
}: {
  rows: Array<{ label: string; count: number }>;
  labelKey?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (rows.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No data yet.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={`${labelKey || "row"}-${row.label}`}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate font-semibold text-foreground">{row.label}</span>
            <span className="num text-muted-foreground">{row.count.toLocaleString()}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { t } = useAppPreferences();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") as AdminTab | null;
  const activeTab: AdminTab = rawTab && TAB_IDS.includes(rawTab) ? rawTab : "overview";

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePlan, setInvitePlan] = useState<"free" | "pro" | "enterprise" | "dealer">("free");
  const [inviteRole, setInviteRole] = useState<"user" | "admin">("user");
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userPlanFilter, setUserPlanFilter] = useState<string>("all");
  const [permitName, setPermitName] = useState("");
  const [permitType, setPermitType] = useState("duty_free");
  const [permitPrice, setPermitPrice] = useState("0");

  const setTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const overviewQuery = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: getAdminOverview,
    refetchInterval: 60_000,
  });
  const usersQuery = useQuery({
    queryKey: ["admin", "users", userQuery, userPlanFilter],
    queryFn: () =>
      getAdminUsers({
        limit: 200,
        q: userQuery.trim() || undefined,
        plan: userPlanFilter === "all" ? undefined : userPlanFilter,
      }),
  });
  const invitesQuery = useQuery({
    queryKey: ["admin", "invites"],
    queryFn: () => getAdminInvites({ limit: 200 }),
  });
  const analyticsQuery = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: getAdminAnalytics,
    enabled: activeTab === "analytics" || activeTab === "overview",
    refetchInterval: 120_000,
  });
  const feedbackQuery = useQuery({
    queryKey: ["admin", "feedback"],
    queryFn: () => getAdminFeedback({ limit: 100 }),
    enabled: activeTab === "feedback" || activeTab === "overview",
  });
  const dealersQuery = useQuery({
    queryKey: ["admin", "dealers"],
    queryFn: () => getAdminDealers({ limit: 100 }),
    enabled: activeTab === "dealers",
  });
  const pipelineQuery = useQuery({
    queryKey: ["admin", "pipeline"],
    queryFn: () => getAdminPipeline({ limit: 50 }),
    enabled: activeTab === "pipeline" || activeTab === "overview",
    refetchInterval: activeTab === "pipeline" ? 60_000 : false,
  });
  const permitsQuery = useQuery({
    queryKey: ["admin", "permits"],
    queryFn: getAdminPermits,
    enabled: activeTab === "permits",
  });
  const systemQuery = useQuery({
    queryKey: ["admin", "system"],
    queryFn: getAdminSystem,
    enabled: activeTab === "system" || activeTab === "overview",
  });

  const invalidateAdmin = () => void queryClient.invalidateQueries({ queryKey: ["admin"] });

  const inviteMutation = useMutation({
    mutationFn: createAdminInvite,
    onSuccess: (invite) => {
      setLastInviteLink(`${window.location.origin}${invite.signupPath}`);
      setInviteEmail("");
      toast.success(`Invite created for ${invite.email}`);
      invalidateAdmin();
    },
    onError: (error: Error) => toast.error(error.message || "Invite failed"),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeAdminInvite,
    onSuccess: () => {
      toast.success("Invite revoked");
      invalidateAdmin();
    },
    onError: (error: Error) => toast.error(error.message || "Revoke failed"),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Parameters<typeof updateAdminUser>[1] }) =>
      updateAdminUser(id, patch),
    onSuccess: () => {
      toast.success("User updated");
      invalidateAdmin();
    },
    onError: (error: Error) => toast.error(error.message || "Update failed"),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateAdminFeedback(id, status),
    onSuccess: () => {
      toast.success("Feedback updated");
      invalidateAdmin();
    },
    onError: (error: Error) => toast.error(error.message || "Update failed"),
  });

  const verifyDealerMutation = useMutation({
    mutationFn: verifyAdminDealer,
    onSuccess: () => {
      toast.success("Dealer verified");
      invalidateAdmin();
    },
    onError: (error: Error) => toast.error(error.message || "Verify failed"),
  });

  const triggerMutation = useMutation({
    mutationFn: (job: "sync" | "alt_sync") => triggerAdminPipeline(job),
    onSuccess: (result) => {
      toast.success(`Pipeline ${result.job} launched (pid ${result.pid})`);
      void pipelineQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message || "Trigger failed"),
  });

  const permitMutation = useMutation({
    mutationFn: upsertAdminPermit,
    onSuccess: () => {
      toast.success("Permit saved");
      setPermitName("");
      setPermitPrice("0");
      invalidateAdmin();
    },
    onError: (error: Error) => toast.error(error.message || "Permit save failed"),
  });

  const cacheMutation = useMutation({
    mutationFn: () => clearAdminStatsCache(),
    onSuccess: (result) => {
      toast.success(`Cleared ${result.deleted} cache row(s)`);
      void systemQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message || "Cache clear failed"),
  });

  const revcarPilotMutation = useMutation({
    mutationFn: () => runRevcarDataPilot(),
    onSuccess: (result) => {
      toast.success(
        `RevCarData pilot: ${result.matched ?? 0}/${result.attempted ?? 0} matched. MSRP not applied to FMV.`,
      );
      void systemQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message || "RevCarData pilot failed"),
  });

  const overview = overviewQuery.data;
  const analytics = analyticsQuery.data;
  const pendingInvites = useMemo(
    () => (invitesQuery.data?.invites || []).filter((invite) => invite.status === "pending"),
    [invitesQuery.data],
  );
  const allInvites = invitesQuery.data?.invites || [];

  const onInvite = (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error("Enter an email");
      return;
    }
    inviteMutation.mutate({
      email: inviteEmail.trim(),
      plan: invitePlan,
      role: inviteRole,
    });
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy — select the link manually");
    }
  };

  const refreshAll = () => {
    void overviewQuery.refetch();
    void usersQuery.refetch();
    void invitesQuery.refetch();
    void analyticsQuery.refetch();
    void feedbackQuery.refetch();
    void dealersQuery.refetch();
    void pipelineQuery.refetch();
    void permitsQuery.refetch();
    void systemQuery.refetch();
  };

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={revealContainer}
      className="relative min-h-[calc(100vh-4rem)] overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,hsl(var(--primary)/0.10),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-[1320px] space-y-8 px-5 py-10 sm:px-6 lg:py-12">
        <motion.header variants={revealItem} className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="section-eyebrow mb-3 inline-flex items-center gap-2">
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Owner console
            </p>
            <h1 className="display-1 text-foreground">
              {t("admin.title", "{brand} control.", { brand: BRAND.name })}
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              Signed in as {user?.email || "admin"}. Manage seats, scrapers, analytics, feedback,
              dealers, permits, and platform security from one place.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 rounded-full border-border bg-card px-5 shadow-soft"
            onClick={refreshAll}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh all
          </Button>
        </motion.header>

        <motion.section variants={revealItem} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overviewQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[124px] rounded-[20px]" />
            ))
          ) : (
            <>
              <MetricTile
                label="Live listings"
                value={formatCount(overview?.listings.live)}
                hint={`${formatCount(overview?.listings.total)} total scraped`}
                icon={Car}
              />
              <MetricTile
                label="Seated users"
                value={formatCount(overview?.users.total)}
                hint={`${formatCount(overview?.users.free)} free · ${formatCount(overview?.users.pro)} pro`}
                icon={Users}
              />
              <MetricTile
                label="Pending invites"
                value={formatCount(overview?.invites.pending)}
                hint={`${formatCount(overview?.users.admins)} admins`}
                icon={MailPlus}
              />
              <MetricTile
                label="Open feedback"
                value={formatCount(overview?.feedback.open)}
                hint={`${formatCount(overview?.dealers.verified)} verified dealers`}
                icon={MessageSquare}
              />
            </>
          )}
        </motion.section>

        <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-border bg-card p-1.5">
            {[
              { id: "overview", label: "Overview", icon: Sparkles },
              { id: "users", label: "Users", icon: Users },
              { id: "invites", label: "Invites", icon: MailPlus },
              { id: "pipeline", label: "Pipeline", icon: Database },
              { id: "analytics", label: "Analytics", icon: BarChart3 },
              { id: "feedback", label: "Feedback", icon: LifeBuoy },
              { id: "dealers", label: "Dealers", icon: Store },
              { id: "permits", label: "Permits", icon: Crown },
              { id: "system", label: "System", icon: Wrench },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="data-card p-6">
                <h2 className="font-display text-lg font-semibold">Quick links</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    { to: "/", label: "Dashboard" },
                    { to: "/pro", label: "Pro terminal" },
                    { to: "/official-pulse", label: "Official Pulse" },
                    { to: "/calculator", label: "Calculators" },
                    { to: "/trends", label: "Trends" },
                    { to: "/price-index", label: "Price index" },
                    { to: "/docs", label: "Docs" },
                    { to: "/pricing", label: "Pricing" },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="inline-flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-foreground no-underline transition-colors hover:border-primary/30"
                    >
                      {item.label}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </div>
              <div className="data-card p-6">
                <h2 className="font-display text-lg font-semibold">Live market glance</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-[12px] font-medium text-muted-foreground">
                      Avg ask
                    </p>
                    <p className="mt-2 text-lg font-semibold num">
                      {formatPrice(analytics?.listings.avgPriceLkr)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-[12px] font-medium text-muted-foreground">
                      Active alerts
                    </p>
                    <p className="mt-2 text-lg font-semibold num">
                      {formatCount(analytics?.alerts.active)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-[12px] font-medium text-muted-foreground">
                      Market signals
                    </p>
                    <p className="mt-2 text-lg font-semibold num">
                      {formatCount(analytics?.signals.total)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <p className="text-[12px] font-medium text-muted-foreground">
                      Scrape health
                    </p>
                    <p className="mt-2 text-lg font-semibold num">
                      {formatCount(analytics?.scrapes.success)} ok /{" "}
                      {formatCount(analytics?.scrapes.failed)} fail
                    </p>
                  </div>
                </div>
                {systemQuery.data ? (
                  <p className="mt-4 text-[12px] text-muted-foreground">
                    DB {systemQuery.data.databaseOk ? "ok" : "down"} · App gate{" "}
                    {systemQuery.data.flags.appAccessEnforced ? "on" : "off"} · Pro gate{" "}
                    {systemQuery.data.flags.proAccessEnforced ? "on" : "off"}
                    {systemQuery.data.providers?.length
                      ? ` · Enrichment ${systemQuery.data.providers.filter((p) => p.enabled && p.configured).length}/${systemQuery.data.providers.length} ready`
                      : ""}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="data-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-lg font-semibold">Top makes · live</h2>
                </div>
                <StatBars
                  rows={(overview?.topMakes || []).map((row) => ({
                    label: row.make,
                    count: row.count,
                  }))}
                />
              </div>
              <div className="data-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-lg font-semibold">Recent scrapes</h2>
                </div>
                <div className="space-y-2">
                  {(overview?.recentScrapes || []).slice(0, 8).map((run) => (
                    <div
                      key={run.id}
                      className="rounded-xl border border-border bg-surface/70 px-3.5 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold">{run.source}</p>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {run.status || "—"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        found {run.listingsFound.toLocaleString()} · new{" "}
                        {run.listingsNew.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <div className="premium-surface overflow-hidden p-0 shadow-soft-lg">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-6 py-5">
                <div>
                  <h2 className="font-display text-lg font-semibold">Users & plans</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Search, filter, upgrade, demote, or disable seats. Changes invalidate their
                    sessions.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search email or name"
                    className="h-10 w-[220px] rounded-full bg-surface"
                  />
                  <Select value={userPlanFilter} onValueChange={setUserPlanFilter}>
                    <SelectTrigger className="h-10 w-[140px] rounded-full bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All plans</SelectItem>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="dealer">Dealer</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="p-6">
                {usersQuery.isLoading ? (
                  <Skeleton className="h-44 rounded-2xl" />
                ) : (usersQuery.data?.users || []).length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No users match.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-[11px] font-medium text-muted-foreground">
                          <th className="pb-3 pr-3 font-bold">User</th>
                          <th className="pb-3 pr-3 font-bold">Plan</th>
                          <th className="pb-3 pr-3 font-bold">Role</th>
                          <th className="pb-3 pr-3 font-bold">Last login</th>
                          <th className="pb-3 pr-3 font-bold">Status</th>
                          <th className="pb-3 font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(usersQuery.data?.users || []).map((row: AdminUser) => (
                          <tr key={row.id} className="border-b border-border/60 last:border-0">
                            <td className="py-4 pr-3">
                              <p className="font-semibold text-foreground">{row.name}</p>
                              <p className="text-[11px] text-muted-foreground">{row.email}</p>
                              {row.invitedByEmail ? (
                                <p className="text-[10px] text-muted-foreground">
                                  invited by {row.invitedByEmail}
                                </p>
                              ) : null}
                            </td>
                            <td className="py-4 pr-3">
                              <Select
                                value={row.plan}
                                onValueChange={(plan) =>
                                  updateUserMutation.mutate({
                                    id: row.id,
                                    patch: { plan: plan as AdminUser["plan"] },
                                  })
                                }
                              >
                                <SelectTrigger className="h-9 w-[128px] rounded-full bg-surface">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">Free</SelectItem>
                                  <SelectItem value="pro">Pro</SelectItem>
                                  <SelectItem value="dealer">Dealer</SelectItem>
                                  <SelectItem value="enterprise">Enterprise</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-4 pr-3">
                              <Select
                                value={row.role}
                                onValueChange={(role) =>
                                  updateUserMutation.mutate({
                                    id: row.id,
                                    patch: { role: role as AdminUser["role"] },
                                  })
                                }
                              >
                                <SelectTrigger className="h-9 w-[118px] rounded-full bg-surface">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="user">User</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-4 pr-3 text-[11px] text-muted-foreground">
                              {row.lastLoginAt
                                ? new Date(row.lastLoginAt).toLocaleString()
                                : "Never"}
                            </td>
                            <td className="py-4 pr-3">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                                {row.isActive ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                                {row.isActive ? "Active" : "Disabled"} · {row.subscriptionStatus}
                              </span>
                            </td>
                            <td className="py-4">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 rounded-full"
                                disabled={row.email === user?.email}
                                onClick={() =>
                                  updateUserMutation.mutate({
                                    id: row.id,
                                    patch: { is_active: !row.isActive },
                                  })
                                }
                              >
                                {row.isActive ? "Disable" : "Enable"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="invites" className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="premium-surface p-6 sm:p-7 shadow-soft-lg">
              <h2 className="font-display text-xl font-semibold">Invite by email</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Only invited addresses can create an account.
              </p>
              <form onSubmit={onInvite} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="dealer@example.com"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="h-11 rounded-xl bg-surface"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Plan</Label>
                    <Select
                      value={invitePlan}
                      onValueChange={(value) => setInvitePlan(value as typeof invitePlan)}
                    >
                      <SelectTrigger className="h-11 rounded-xl bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="dealer">Dealer</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => setInviteRole(value as typeof inviteRole)}
                    >
                      <SelectTrigger className="h-11 rounded-xl bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="h-11 w-full gap-2 rounded-full"
                >
                  <Crown className="h-3.5 w-3.5" />
                  {inviteMutation.isPending ? "Creating…" : "Create invite"}
                </Button>
              </form>
              {lastInviteLink ? (
                <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
                  <p className="tech-label text-primary-bright">Share this link</p>
                  <p className="mt-2 break-all text-[12px] font-medium leading-relaxed">
                    {lastInviteLink}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 h-9 gap-1.5 rounded-full"
                    onClick={() => void copyLink(lastInviteLink)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy link
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="data-card p-6">
                <h3 className="font-display text-lg font-semibold">
                  Pending ({pendingInvites.length})
                </h3>
                <div className="mt-4 space-y-2">
                  {pendingInvites.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No pending invites.</p>
                  ) : (
                    pendingInvites.map((invite: AdminInvite) => {
                      const link = `${window.location.origin}${invite.signupPath}`;
                      return (
                        <div
                          key={invite.id}
                          className="rounded-xl border border-border bg-surface/80 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[14px] font-semibold">{invite.email}</p>
                              <p className="text-[11px] font-medium text-muted-foreground">
                                {invite.plan} · {invite.role}
                                {invite.expiresAt
                                  ? ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 rounded-full"
                                onClick={() => void copyLink(link)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-9 rounded-full"
                                onClick={() => revokeMutation.mutate(invite.id)}
                              >
                                Revoke
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="data-card p-6">
                <h3 className="font-display text-lg font-semibold">Invite history</h3>
                <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto">
                  {allInvites.map((invite) => (
                    <div
                      key={`hist-${invite.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-3 py-2 text-[12px]"
                    >
                      <span className="truncate font-medium">{invite.email}</span>
                      <span className="shrink-0 font-medium text-muted-foreground">
                        {invite.status} · {invite.plan}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-10 rounded-full"
                disabled={triggerMutation.isPending}
                onClick={() => triggerMutation.mutate("sync")}
              >
                Trigger core sync
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full"
                disabled={triggerMutation.isPending}
                onClick={() => triggerMutation.mutate("alt_sync")}
              >
                Trigger alt sync
              </Button>
            </div>
            <div className="premium-surface overflow-hidden p-0">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-lg font-semibold">Scrape runs</h2>
                <p className="text-[12px] text-muted-foreground">
                  Full error text visible to session admins.
                  {pipelineQuery.data?.orphansReconciled
                    ? ` Reconciled ${pipelineQuery.data.orphansReconciled} orphan run(s).`
                    : ""}
                </p>
              </div>
              <div className="overflow-x-auto p-6">
                {pipelineQuery.isLoading ? (
                  <Skeleton className="h-40 rounded-2xl" />
                ) : (
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-[11px] font-medium text-muted-foreground">
                        <th className="pb-3 pr-3">Source</th>
                        <th className="pb-3 pr-3">Status</th>
                        <th className="pb-3 pr-3">Found</th>
                        <th className="pb-3 pr-3">New</th>
                        <th className="pb-3 pr-3">Started</th>
                        <th className="pb-3">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pipelineQuery.data?.runs || []).map((run) => (
                        <tr key={run.id} className="border-b border-border/50">
                          <td className="py-3 pr-3 font-semibold">{run.source}</td>
                          <td className="py-3 pr-3">{run.status || "—"}</td>
                          <td className="py-3 pr-3 num">{run.listingsFound}</td>
                          <td className="py-3 pr-3 num">{run.listingsNew}</td>
                          <td className="py-3 pr-3 text-[11px] text-muted-foreground">
                            {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                          </td>
                          <td className="max-w-[280px] truncate py-3 text-[11px] text-rose-600">
                            {run.errorMessage || ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {analyticsQuery.isLoading ? (
              <Skeleton className="h-64 rounded-2xl" />
            ) : analytics ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile
                    label="Avg listing price"
                    value={formatPrice(analytics.listings.avgPriceLkr)}
                    hint={`${formatPrice(analytics.listings.minPriceLkr)} – ${formatPrice(analytics.listings.maxPriceLkr)}`}
                    icon={BarChart3}
                  />
                  <MetricTile
                    label="Signups today"
                    value={formatCount(analytics.users.signupsToday)}
                    hint={`${formatCount(analytics.users.neverLoggedIn)} never logged in`}
                    icon={Users}
                  />
                  <MetricTile
                    label="Active alerts"
                    value={formatCount(analytics.alerts.active)}
                    hint={`${formatCount(analytics.alerts.withWhatsapp)} with WhatsApp`}
                    icon={Activity}
                  />
                  <MetricTile
                    label="Scrape outcomes"
                    value={`${formatCount(analytics.scrapes.success)}/${formatCount(analytics.scrapes.failed)}`}
                    hint="success / failed (all time)"
                    icon={Database}
                  />
                </div>
                <div className="grid gap-6 xl:grid-cols-3">
                  <div className="data-card p-6">
                    <h3 className="mb-4 font-display text-lg font-semibold">Listings by source</h3>
                    <StatBars
                      rows={analytics.listings.bySource.map((row) => ({
                        label: row.source,
                        count: row.count,
                      }))}
                    />
                  </div>
                  <div className="data-card p-6">
                    <h3 className="mb-4 font-display text-lg font-semibold">Listings by district</h3>
                    <StatBars
                      rows={analytics.listings.byDistrict.map((row) => ({
                        label: row.district,
                        count: row.count,
                      }))}
                    />
                  </div>
                  <div className="data-card p-6">
                    <h3 className="mb-4 font-display text-lg font-semibold">Users by plan</h3>
                    <StatBars
                      rows={analytics.users.byPlan.map((row) => ({
                        label: row.plan,
                        count: row.count,
                      }))}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Analytics unavailable.</p>
            )}
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4">
            <div className="premium-surface overflow-hidden p-0">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-lg font-semibold">Feedback inbox</h2>
                <p className="text-[12px] text-muted-foreground">
                  Triage bugs, ideas, and data reports from the in-app widget.
                </p>
              </div>
              <div className="space-y-3 p-6">
                {feedbackQuery.isLoading ? (
                  <Skeleton className="h-40 rounded-2xl" />
                ) : (feedbackQuery.data?.feedback || []).length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No feedback yet.</p>
                ) : (
                  (feedbackQuery.data?.feedback || []).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-border bg-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-medium text-primary/80">
                            {item.category} · {item.status}
                          </p>
                          <p className="mt-2 text-[14px] font-medium leading-relaxed text-foreground">
                            {item.message}
                          </p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {item.email || "anonymous"}
                            {item.route ? ` · ${item.route}` : ""}
                            {item.createdAt
                              ? ` · ${new Date(item.createdAt).toLocaleString()}`
                              : ""}
                          </p>
                        </div>
                        <Select
                          value={item.status}
                          onValueChange={(status) =>
                            feedbackMutation.mutate({ id: item.id, status })
                          }
                        >
                          <SelectTrigger className="h-9 w-[130px] rounded-full bg-card">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">new</SelectItem>
                            <SelectItem value="open">open</SelectItem>
                            <SelectItem value="triaged">triaged</SelectItem>
                            <SelectItem value="resolved">resolved</SelectItem>
                            <SelectItem value="closed">closed</SelectItem>
                            <SelectItem value="spam">spam</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="dealers" className="space-y-4">
            <div className="premium-surface overflow-hidden p-0">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-lg font-semibold">Dealer claims</h2>
                <p className="text-[12px] text-muted-foreground">
                  Verify pending yards without the separate dealer admin token.
                </p>
              </div>
              <div className="overflow-x-auto p-6">
                {dealersQuery.isLoading ? (
                  <Skeleton className="h-40 rounded-2xl" />
                ) : (dealersQuery.data?.dealers || []).length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No dealer profiles yet.</p>
                ) : (
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-[11px] font-medium text-muted-foreground">
                        <th className="pb-3 pr-3">Dealer</th>
                        <th className="pb-3 pr-3">Contact</th>
                        <th className="pb-3 pr-3">Status</th>
                        <th className="pb-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dealersQuery.data?.dealers || []).map((dealer) => (
                        <tr key={dealer.id} className="border-b border-border/50">
                          <td className="py-3 pr-3">
                            <p className="font-semibold">{dealer.displayName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {dealer.sellerNamePattern || dealer.claimedUrl || "—"}
                            </p>
                          </td>
                          <td className="py-3 pr-3 text-[12px] text-muted-foreground">
                            {dealer.contactEmail || dealer.contactPhone || "—"}
                          </td>
                          <td className="py-3 pr-3 text-[11px] font-medium">
                            {dealer.status}
                          </td>
                          <td className="py-3">
                            {dealer.status !== "verified" ? (
                              <Button
                                type="button"
                                size="sm"
                                className="h-9 rounded-full"
                                onClick={() => verifyDealerMutation.mutate(dealer.id)}
                              >
                                Verify
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Verified</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="permits" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="premium-surface p-6">
              <h2 className="font-display text-lg font-semibold">Upsert permit price</h2>
              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  permitMutation.mutate({
                    permit_name: permitName.trim(),
                    permit_type: permitType.trim(),
                    market_price_lkr: Number(permitPrice) || 0,
                  });
                }}
              >
                <Input
                  value={permitName}
                  onChange={(e) => setPermitName(e.target.value)}
                  placeholder="Permit name"
                  className="h-11 rounded-xl bg-surface"
                  required
                />
                <Input
                  value={permitType}
                  onChange={(e) => setPermitType(e.target.value)}
                  placeholder="Type (duty_free / ev)"
                  className="h-11 rounded-xl bg-surface"
                  required
                />
                <Input
                  type="number"
                  value={permitPrice}
                  onChange={(e) => setPermitPrice(e.target.value)}
                  placeholder="Market price LKR"
                  className="h-11 rounded-xl bg-surface num"
                  required
                />
                <Button type="submit" className="h-11 w-full rounded-full" disabled={permitMutation.isPending}>
                  Save permit
                </Button>
              </form>
            </div>
            <div className="data-card p-6">
              <h3 className="font-display text-lg font-semibold">Current permits</h3>
              <div className="mt-4 space-y-2">
                {(permitsQuery.data?.permits || []).map((permit) => (
                  <div
                    key={permit.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-3"
                  >
                    <div>
                      <p className="text-[13px] font-semibold">{permit.permitName}</p>
                      <p className="text-[11px] text-muted-foreground">{permit.permitType}</p>
                    </div>
                    <p className="num text-[13px] font-semibold">
                      {formatPrice(permit.marketPriceLkr)}
                    </p>
                  </div>
                ))}
                {!permitsQuery.isLoading && (permitsQuery.data?.permits || []).length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No permits configured.</p>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="data-card p-6">
                <h2 className="font-display text-lg font-semibold">Security & config</h2>
                {systemQuery.isLoading ? (
                  <Skeleton className="mt-4 h-40 rounded-2xl" />
                ) : systemQuery.data ? (
                  <ul className="mt-4 space-y-2 text-[13px]">
                    {[
                      ["Database", systemQuery.data.databaseOk ? "ok" : "down"],
                      ["App access enforced", String(systemQuery.data.flags.appAccessEnforced)],
                      ["Pro access enforced", String(systemQuery.data.flags.proAccessEnforced)],
                      ["Admin API key", systemQuery.data.flags.adminApiKeyConfigured ? "set" : "missing"],
                      ["Billing webhook", systemQuery.data.flags.billingWebhookConfigured ? "set" : "missing"],
                      ["B2B API keys", systemQuery.data.flags.b2bKeysConfigured ? "set" : "missing"],
                      ["Invite email (Resend)", systemQuery.data.flags.resendConfigured ? "set" : "missing"],
                      ["Twilio WhatsApp", systemQuery.data.flags.twilioConfigured ? "set" : "missing"],
                      ["Public app origin", systemQuery.data.flags.publicAppOrigin || "unset"],
                    ].map(([label, value]) => (
                      <li
                        key={label}
                        className="flex items-center justify-between rounded-2xl border border-border bg-surface px-3 py-2"
                      >
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="data-card p-6">
                <h2 className="font-display text-lg font-semibold">Ops tools</h2>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Clear the 1-hour market stats cache so summary / district endpoints recompute
                  immediately after data changes.
                </p>
                <Button
                  type="button"
                  className="mt-4 h-10 rounded-full"
                  disabled={cacheMutation.isPending}
                  onClick={() => cacheMutation.mutate()}
                >
                  Clear stats cache
                </Button>
                {systemQuery.data?.statsCacheKeys?.length ? (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Keys: {systemQuery.data.statsCacheKeys.join(", ")}
                  </p>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">No cache rows currently.</p>
                )}
              </div>
            </div>
            <div className="data-card p-6">
              <h2 className="font-display text-lg font-semibold">Enrichment providers</h2>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Third-party research adapters. Keys stay on the backend. A failed provider must
                never take down listing pages.
              </p>
              {systemQuery.isLoading ? (
                <Skeleton className="mt-4 h-32 rounded-2xl" />
              ) : systemQuery.data?.providers?.length ? (
                <ul className="mt-4 grid gap-2 md:grid-cols-2">
                  {systemQuery.data.providers.map((provider) => (
                    <li
                      key={provider.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3 py-2 text-[13px]"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-foreground">{provider.label}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {provider.lastRun?.endedAt
                            ? `Last run ${new Date(provider.lastRun.endedAt).toLocaleString()}`
                            : "No ingest run recorded"}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-foreground">
                        {providerStatusLabel(provider)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-[13px] text-muted-foreground">Provider health unavailable.</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={revcarPilotMutation.isPending}
                onClick={() => revcarPilotMutation.mutate()}
              >
                {revcarPilotMutation.isPending ? "Running spec pilot…" : "Run RevCarData 100-record pilot"}
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Match-rate sample only. Foreign MSRP is never written into LKR fair market value.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}
