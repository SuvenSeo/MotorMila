import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Crown, MailPlus } from "lucide-react";
import { toast } from "sonner";
import {
  AdminCard,
  AdminEmptyNote,
  AdminErrorNote,
} from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAdminInvite, getAdminInvites, revokeAdminInvite, type AdminInvite } from "@/services/api";

/** Invites — unchanged behaviour from the old tab, in the new kit cards. */
export function InvitesView() {
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePlan, setInvitePlan] = useState<"free" | "pro" | "enterprise" | "dealer">("free");
  const [inviteRole, setInviteRole] = useState<"user" | "admin">("user");
  const [lastInviteLink, setLastInviteLink] = useState("");

  const q = useQuery({ queryKey: ["admin", "invites"], queryFn: () => getAdminInvites({ limit: 200 }) });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin"] });

  const create = useMutation({
    mutationFn: createAdminInvite,
    onSuccess: (invite) => {
      setLastInviteLink(`${window.location.origin}${invite.signupPath}`);
      setInviteEmail("");
      toast.success(`Invite created for ${invite.email}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Invite failed"),
  });

  const revoke = useMutation({
    mutationFn: revokeAdminInvite,
    onSuccess: () => {
      toast.success("Invite revoked");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Revoke failed"),
  });

  const invites = q.data?.invites ?? [];
  const pending = useMemo(() => invites.filter((i) => i.status === "pending"), [invites]);

  const onInvite = (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error("Enter an email");
      return;
    }
    create.mutate({ email: inviteEmail.trim(), plan: invitePlan, role: inviteRole });
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy — select the link manually");
    }
  };

  return (
    <>
      <header>
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">Invites</h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-5 text-label-2">Only invited addresses can create an account.</p>
      </header>

      {q.error ? <AdminErrorNote message="Couldn't load invites. Try again." onRetry={() => void q.refetch()} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <AdminCard title="Invite by email" description="Create a seat for a new user or dealer.">
          <form onSubmit={onInvite} className="space-y-4 px-5 pb-5">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="dealer@example.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={invitePlan} onValueChange={(v) => setInvitePlan(v as typeof invitePlan)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
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
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={create.isPending} className="h-11 w-full gap-2 rounded-full">
              <Crown className="h-3.5 w-3.5" />
              {create.isPending ? "Creating…" : "Create invite"}
            </Button>
          </form>
          {lastInviteLink ? (
            <div className="mx-5 mb-5 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="text-footnote font-semibold text-primary">Share this link</p>
              <p className="mt-2 break-all text-caption font-medium leading-relaxed">{lastInviteLink}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3 h-9 gap-1.5 rounded-full" onClick={() => void copyLink(lastInviteLink)}>
                <Copy className="h-3 w-3" />
                Copy link
              </Button>
            </div>
          ) : null}
        </AdminCard>

        <div className="space-y-4">
          <AdminCard title={`Pending (${pending.length})`}>
            <div className="space-y-2 px-5 pb-5">
              {pending.length === 0 ? (
                <AdminEmptyNote icon={MailPlus} title="No pending invites." className="py-8" />
              ) : (
                pending.map((invite: AdminInvite) => {
                  const link = `${window.location.origin}${invite.signupPath}`;
                  return (
                    <div key={invite.id} className="rounded-xl border border-border bg-surface-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-body font-semibold">{invite.email}</p>
                          <p className="text-caption font-medium text-label-2">
                            {invite.plan} · {invite.role}
                            {invite.expiresAt ? ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button type="button" size="sm" variant="outline" className="h-9 rounded-full" onClick={() => void copyLink(link)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-9 rounded-full" onClick={() => revoke.mutate(invite.id)}>
                            Revoke
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </AdminCard>
          <AdminCard title="Invite history">
            <div className="max-h-[320px] space-y-2 overflow-y-auto px-5 pb-5">
              {invites.map((invite) => (
                <div key={`hist-${invite.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2 text-caption">
                  <span className="truncate font-medium">{invite.email}</span>
                  <span className="shrink-0 font-medium text-label-2">
                    {invite.status} · {invite.plan}
                  </span>
                </div>
              ))}
            </div>
          </AdminCard>
        </div>
      </div>
    </>
  );
}
