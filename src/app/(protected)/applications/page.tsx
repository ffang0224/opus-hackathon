import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP_BRAND } from "@/lib/branding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/types/app";

type WorkflowMode = "submit" | "review";
type PortalView = "vendor" | "admin" | "combined";

const REVIEW_STATUSES: ApplicationStatus[] = ["submitted", "reviewed", "approved", "rejected"];
const DECISION_PENDING_STATUSES: ApplicationStatus[] = ["submitted", "reviewed"];

function resolvePortal(value?: string): PortalView {
  if (value === "vendor" || value === "admin") return value;
  return "combined";
}

function resolveMode(value: string | undefined, portal: PortalView): WorkflowMode {
  if (value === "submit" || value === "review") return value;
  if (portal === "admin") return "review";
  return "submit";
}

export default async function ApplicationsPage({
  searchParams
}: {
  searchParams: { search?: string; mode?: string; portal?: string };
}) {
  const search = searchParams.search?.trim();
  const portal = resolvePortal(searchParams.portal);
  const mode = resolveMode(searchParams.mode, portal);

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  let query = supabase
    .from("applications")
    .select("id,vendor_name,status,created_at,updated_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  if (search) {
    query = query.ilike("vendor_name", `%${search}%`);
  }

  const { data: allApplications } = await query;

  const submitItems = (allApplications ?? []).filter((app) => app.status === "draft");
  const reviewItems = (allApplications ?? []).filter((app) => REVIEW_STATUSES.includes(app.status as ApplicationStatus));
  const pendingDecisionItems = (allApplications ?? []).filter((app) => DECISION_PENDING_STATUSES.includes(app.status as ApplicationStatus));
  const approvedItems = (allApplications ?? []).filter((app) => app.status === "approved");
  const rejectedItems = (allApplications ?? []).filter((app) => app.status === "rejected");

  const activeList =
    portal === "vendor" ? (allApplications ?? []) : portal === "admin" ? reviewItems : mode === "submit" ? submitItems : reviewItems;

  const detailView = portal === "vendor" ? "vendor" : portal === "admin" ? "admin" : mode === "submit" ? "vendor" : "admin";

  return (
    <div className="space-y-6">
      <div className="hero-panel panel-hover p-6">
        <p className="section-title">{APP_BRAND.shortName}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {portal === "vendor"
                ? "Vendor Submission Workspace"
                : portal === "admin"
                  ? "Admin Review Workspace"
                  : "Application Workspace"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {portal === "vendor"
                ? "Collect required files, submit applications, and track review progress."
                : portal === "admin"
                  ? "Review submissions, monitor processing, and finalize approvals."
                  : "Switch between submission and review lanes."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Demo note: vendor and admin actions share one account in this MVP.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {portal !== "admin" ? (
              <Link href="/applications/new?portal=vendor">
                <Button>Start New Submission</Button>
              </Link>
            ) : null}
            {portal === "admin" ? (
              <Link href="/vendors">
                <Button variant="outline">Open Vendor Registry</Button>
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          <div className="metric-panel p-3">
            <p className="text-xs text-muted-foreground">All Applications</p>
            <p className="mt-1 text-2xl font-semibold">{allApplications?.length ?? 0}</p>
          </div>
          <div className="metric-panel border-amber-300/60 bg-amber-50/70 p-3">
            <p className="text-xs text-amber-800">Draft Submissions</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{submitItems.length}</p>
          </div>
          <div className="metric-panel border-sky-300/60 bg-sky-50/70 p-3">
            <p className="text-xs text-sky-800">Pending Decision</p>
            <p className="mt-1 text-2xl font-semibold text-sky-900">{pendingDecisionItems.length}</p>
          </div>
          <div className="metric-panel border-emerald-300/60 bg-emerald-50/75 p-3">
            <p className="text-xs text-emerald-800">Approved</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-900">{approvedItems.length}</p>
          </div>
          <div className="metric-panel border-rose-300/60 bg-rose-50/75 p-3">
            <p className="text-xs text-rose-800">Rejected</p>
            <p className="mt-1 text-2xl font-semibold text-rose-900">{rejectedItems.length}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Link
          href="/vendor/applications"
          className={`rounded-xl border p-4 transition panel-hover ${portal === "vendor" ? "border-primary/50 bg-blue-50/70" : "bg-white/82"}`}
        >
          <p className="section-title">Role Tab</p>
          <p className="text-lg font-semibold">Vendor</p>
          <p className="text-sm text-muted-foreground">Submission-first view with file and progress focus.</p>
        </Link>
        <Link
          href="/admin/applications"
          className={`rounded-xl border p-4 transition panel-hover ${portal === "admin" ? "border-primary/50 bg-blue-50/70" : "bg-white/82"}`}
        >
          <p className="section-title">Role Tab</p>
          <p className="text-lg font-semibold">Admin</p>
          <p className="text-sm text-muted-foreground">Decision-first view with review status and final actions.</p>
        </Link>
      </div>

      {portal === "combined" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href={`/applications?portal=combined&mode=submit${search ? `&search=${encodeURIComponent(search)}` : ""}`}
            className={`rounded-xl border p-5 transition panel-hover ${
              mode === "submit" ? "border-primary/50 bg-blue-50/70" : "bg-white/82"
            }`}
          >
            <p className="section-title">Lane 1</p>
            <h2 className="mt-1 text-xl font-semibold">Submission Queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Draft applications waiting for final send.</p>
            <p className="mt-4 text-2xl font-semibold">{submitItems.length}</p>
          </Link>

          <Link
            href={`/applications?portal=combined&mode=review${search ? `&search=${encodeURIComponent(search)}` : ""}`}
            className={`rounded-xl border p-5 transition panel-hover ${
              mode === "review" ? "border-primary/50 bg-blue-50/70" : "bg-white/82"
            }`}
          >
            <p className="section-title">Lane 2</p>
            <h2 className="mt-1 text-xl font-semibold">Review Queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Submitted applications ready for compliance decisioning.</p>
            <p className="mt-4 text-2xl font-semibold">{reviewItems.length}</p>
          </Link>
        </div>
      ) : null}

      <form className="max-w-sm" method="get">
        <input type="hidden" name="portal" value={portal} />
        {portal === "combined" ? <input type="hidden" name="mode" value={mode} /> : null}
        <Input name="search" defaultValue={search} placeholder="Search vendor name" autoComplete="off" />
      </form>

      <div className="table-shell">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeList.map((app) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">{app.vendor_name}</TableCell>
                <TableCell>{new Date(app.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <StatusBadge status={app.status as ApplicationStatus} />
                </TableCell>
                <TableCell>{new Date(app.updated_at).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/applications/${app.id}?view=${detailView}`}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Open {detailView === "vendor" ? "Submission" : "Review"}
                    </Link>
                    <form action={`/api/applications/${app.id}/delete`} method="post">
                      <Button size="sm" variant="destructive" type="submit">
                        Delete
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {activeList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {portal === "vendor"
                    ? "No applications yet. Start a new submission to begin."
                    : portal === "admin"
                      ? "No review-ready applications yet."
                      : mode === "submit"
                        ? "No draft applications."
                        : "No review-ready applications."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {portal !== "combined" ? (
        <p className="text-xs text-muted-foreground">
          Need both lanes for debugging? Open <Link className="underline-offset-4 hover:underline" href="/applications?portal=combined">combined view</Link>.
        </p>
      ) : null}
    </div>
  );
}
