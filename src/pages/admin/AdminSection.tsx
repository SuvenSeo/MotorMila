import { Navigate, useSearchParams } from "react-router-dom";
import { AnalyticsView } from "@/pages/admin/AnalyticsView";
import { DataRequestsView } from "@/pages/admin/DataRequestsView";
import { DealersView } from "@/pages/admin/DealersView";
import { FeedbackView } from "@/pages/admin/FeedbackView";
import { HealthView } from "@/pages/admin/HealthView";
import { InvitesView } from "@/pages/admin/InvitesView";
import { LeadsView } from "@/pages/admin/LeadsView";
import { LogsView } from "@/pages/admin/LogsView";
import { ModerationView } from "@/pages/admin/ModerationView";
import { OverviewView } from "@/pages/admin/OverviewView";
import { PermitsView } from "@/pages/admin/PermitsView";
import { PipelineView } from "@/pages/admin/PipelineView";
import { SystemView } from "@/pages/admin/SystemView";
import { UsersView } from "@/pages/admin/UsersView";

export type AdminSectionId =
  | "overview"
  | "analytics"
  | "users"
  | "leads"
  | "feedback"
  | "logs"
  | "health"
  | "data-requests"
  | "invites"
  | "pipeline"
  | "dealers"
  | "permits"
  | "moderation"
  | "system";

/** Old ?tab= values → new routes. "removals" was merged into data-requests. */
export const ADMIN_TAB_REDIRECTS: Record<string, string> = {
  overview: "/motormila/admin",
  analytics: "/motormila/admin/analytics",
  users: "/motormila/admin/users",
  leads: "/motormila/admin/leads",
  feedback: "/motormila/admin/feedback",
  logs: "/motormila/admin/logs",
  health: "/motormila/admin/health",
  "data-requests": "/motormila/admin/data-requests",
  removals: "/motormila/admin/data-requests",
  invites: "/motormila/admin/invites",
  pipeline: "/motormila/admin/pipeline",
  dealers: "/motormila/admin/dealers",
  permits: "/motormila/admin/permits",
  moderation: "/motormila/admin/moderation",
  system: "/motormila/admin/system",
};

const VIEWS: Record<AdminSectionId, () => React.JSX.Element> = {
  overview: OverviewView,
  analytics: AnalyticsView,
  users: UsersView,
  leads: LeadsView,
  feedback: FeedbackView,
  logs: LogsView,
  health: HealthView,
  "data-requests": DataRequestsView,
  invites: InvitesView,
  pipeline: PipelineView,
  dealers: DealersView,
  permits: PermitsView,
  moderation: ModerationView,
  system: SystemView,
};

export function AdminSection({ section }: { section: AdminSectionId }) {
  const View = VIEWS[section];
  return <View />;
}

/** Index route: honours legacy /motormila/admin?tab=<old tab>, else Overview. */
export function AdminIndex() {
  const [params] = useSearchParams();
  const tab = params.get("tab");
  if (tab && ADMIN_TAB_REDIRECTS[tab]) {
    return <Navigate to={ADMIN_TAB_REDIRECTS[tab]} replace />;
  }
  return <OverviewView />;
}
