import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AdminEmptyNote,
  AdminErrorNote,
  AdminSearchField,
  adminCardClass,
  adminTdClass,
  adminThClass,
  formatRelative,
} from "@/components/admin/AdminKit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminUsers, updateAdminUser, type AdminUser } from "@/services/api";
import { useAuth } from "@/lib/authContext";

type SortKey = "created" | "lastLogin" | "name";

/**
 * Users — search, plan filter, and sorting. Sort keys are first seen
 * (account created) and last seen (last login); the platform has no
 * sign-in count column, so there is no "most sign-ins" sort to offer —
 * that would need a new column, not a UI label.
 */
export function UsersView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("created");

  const q = useQuery({
    queryKey: ["admin", "users", query, planFilter],
    queryFn: () => getAdminUsers({ limit: 200, q: query.trim() || undefined, plan: planFilter === "all" ? undefined : planFilter }),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Parameters<typeof updateAdminUser>[1] }) => updateAdminUser(id, patch),
    onSuccess: () => {
      toast.success("User updated");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

  const rows = useMemo(() => {
    const list = [...(q.data?.users ?? [])];
    const time = (iso?: string | null) => (iso ? Date.parse(iso) : 0);
    list.sort((a, b) => {
      if (sort === "name") return (a.name || a.email).localeCompare(b.name || b.email);
      if (sort === "lastLogin") return time(b.lastLoginAt) - time(a.lastLoginAt);
      return time(b.createdAt) - time(a.createdAt);
    });
    return list;
  }, [q.data, sort]);

  return (
    <>
      <header>
        <h1 className="font-display text-[1.875rem] leading-[1.1] tracking-[-0.01em] text-foreground sm:text-[2.25rem]">Users</h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-5 text-label-2">
          Search, filter, upgrade, demote, or disable seats. Changes invalidate their sessions.
        </p>
      </header>

      {q.error ? <AdminErrorNote message="Couldn't load users. Try again." onRetry={() => void q.refetch()} /> : null}

      <div className={adminCardClass}>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2 className="font-display text-callout font-semibold">Users & plans</h2>
            <p className="mt-1 text-caption text-label-2">{q.data ? `${q.data.total} in all` : "Loading…"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminSearchField value={query} onChange={setQuery} placeholder="Search email or name" label="Search users" className="w-[220px]" />
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-10 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="dealer">Dealer</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-10 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created">First seen</SelectItem>
                <SelectItem value="lastLogin">Last seen</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="p-6">
          {q.isLoading ? (
            <Skeleton className="h-44" />
          ) : rows.length === 0 ? (
            <AdminEmptyNote icon={Users} title="No users match." className="py-8" />
          ) : (
            <TableContainer className="border-0">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className={adminThClass}>User</TableHead>
                    <TableHead className={adminThClass}>Plan</TableHead>
                    <TableHead className={adminThClass}>Role</TableHead>
                    <TableHead className={adminThClass}>First seen</TableHead>
                    <TableHead className={adminThClass}>Last seen</TableHead>
                    <TableHead className={adminThClass}>Status</TableHead>
                    <TableHead className={adminThClass}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: AdminUser) => (
                    <TableRow key={row.id}>
                      <TableCell className={adminTdClass}>
                        <p className="font-semibold text-foreground">{row.name}</p>
                        <p className="text-caption text-label-2">{row.email}</p>
                        {row.invitedByEmail ? <p className="text-caption text-label-2">invited by {row.invitedByEmail}</p> : null}
                      </TableCell>
                      <TableCell className={adminTdClass}>
                        <Select value={row.plan} onValueChange={(plan) => update.mutate({ id: row.id, patch: { plan: plan as AdminUser["plan"] } })}>
                          <SelectTrigger className="h-9 w-[128px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="dealer">Dealer</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className={adminTdClass}>
                        <Select value={row.role} onValueChange={(role) => update.mutate({ id: row.id, patch: { role: role as AdminUser["role"] } })}>
                          <SelectTrigger className="h-9 w-[118px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className={cnText()}>{row.createdAt ? formatRelative(row.createdAt) : "—"}</TableCell>
                      <TableCell className={cnText()}>{row.lastLoginAt ? formatRelative(row.lastLoginAt) : "Never"}</TableCell>
                      <TableCell className={adminTdClass}>
                        <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-label-2">
                          {row.isActive ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                          {row.isActive ? "Active" : "Disabled"} · {row.subscriptionStatus}
                        </span>
                      </TableCell>
                      <TableCell className={adminTdClass}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-full"
                          disabled={row.email === user?.email}
                          onClick={() => update.mutate({ id: row.id, patch: { is_active: !row.isActive } })}
                        >
                          {row.isActive ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>
      </div>
    </>
  );
}

function cnText() {
  return `${adminTdClass} text-caption text-label-2`;
}
