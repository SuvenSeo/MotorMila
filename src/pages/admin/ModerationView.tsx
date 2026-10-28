import { AdminHeader } from "@/components/admin/AdminKit";
import { ModerationQueuePanel } from "@/pages/admin/AdminQueues";

/** Moderation — the existing queue panel, under the new shell. */
export function ModerationView() {
  return (
    <>
      <AdminHeader
        title="Moderation"
        description="Ads posted on Motormila by users. Approve to publish, reject to return to the owner as a draft."
      />
      <ModerationQueuePanel />
    </>
  );
}
