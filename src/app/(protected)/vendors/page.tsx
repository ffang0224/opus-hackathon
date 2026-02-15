import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_BRAND } from "@/lib/branding";
import { Input } from "@/components/ui/input";
import { normalizeResultsPayload } from "@/lib/workflow/normalize-results";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ImportantDate = {
  label: string;
  value: string;
  state: "expired" | "due_soon" | "upcoming" | "historical" | "unlabeled";
  daysDelta: number;
};

function toMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString();
}

function isHistoricalLabel(label: string) {
  return /\b(registration|issue|issued)\b/i.test(label);
}

function isUnlabeledLabel(label: string) {
  return /^(other|unknown|unlabeled|undetected)?$/i.test(label.trim());
}

function extractImportantDates(input: unknown): ImportantDate[] {
  if (!input || typeof input !== "object") return [];
  const normalized = normalizeResultsPayload(input as Record<string, unknown>);
  const raw = normalized.important_dates;
  if (!Array.isArray(raw)) return [];

  const today = toMidnight(new Date());
  const items = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const value = entry as Record<string, unknown>;
      const dateValue = typeof value.date_value === "string" ? value.date_value : null;
      if (!dateValue) return null;

      const parsed = new Date(dateValue);
      if (Number.isNaN(parsed.getTime())) return null;

      const target = toMidnight(parsed);
      const daysDelta = Math.round((target - today) / (1000 * 60 * 60 * 24));
      const rawLabel = typeof value.date_label === "string" ? value.date_label : "";
      const unlabeled = isUnlabeledLabel(rawLabel);
      const label = unlabeled ? "Unlabeled Date" : rawLabel;
      const state =
        unlabeled
          ? "unlabeled"
          : daysDelta < 0 && isHistoricalLabel(label)
          ? "historical"
          : daysDelta < 0
            ? "expired"
            : daysDelta <= 30
              ? "due_soon"
              : "upcoming";
      return {
        label,
        value: dateValue,
        state,
        daysDelta
      } satisfies ImportantDate;
    })
    .filter(Boolean) as ImportantDate[];

  return items.sort((a, b) => Math.abs(a.daysDelta) - Math.abs(b.daysDelta));
}

function relativeText(state: ImportantDate["state"], daysDelta: number) {
  if (state === "unlabeled") return "unlabeled";
  if (state === "historical") return `recorded ${Math.abs(daysDelta)}d ago`;
  if (daysDelta < 0) return `${Math.abs(daysDelta)}d ago`;
  if (daysDelta === 0) return "today";
  return `in ${daysDelta}d`;
}

export default async function VendorsPage({ searchParams }: { searchParams: { search?: string } }) {
  const search = searchParams.search?.trim();
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  let query = supabase
    .from("vendors")
    .select("id,name,contact_json,latest_compliance_json,updated_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data: vendors } = await query;

  const cards = (vendors ?? []).map((vendor) => {
    const contact = vendor.contact_json && typeof vendor.contact_json === "object" ? (vendor.contact_json as Record<string, unknown>) : {};
    const importantDates = extractImportantDates(vendor.latest_compliance_json);
    const unlabeledDates = importantDates.filter((date) => date.state === "unlabeled");
    const labeledDates = importantDates.filter((date) => date.state !== "unlabeled");
    const expiringSoon = labeledDates.filter((date) => date.state === "due_soon").length;
    const flagged = labeledDates.filter((date) => date.state === "expired").length;
    const historical = labeledDates.filter((date) => date.state === "historical").length;

    return {
      ...vendor,
      contact,
      importantDates: labeledDates,
      unlabeledDates,
      expiringSoon,
      flagged,
      historical,
      unlabeledCount: unlabeledDates.length
    };
  });

  const expiringSoonTotal = cards.reduce((count, vendor) => count + vendor.expiringSoon, 0);
  const flaggedTotal = cards.reduce((count, vendor) => count + vendor.flagged, 0);
  const historicalTotal = cards.reduce((count, vendor) => count + vendor.historical, 0);
  const unlabeledTotal = cards.reduce((count, vendor) => count + vendor.unlabeledCount, 0);

  return (
    <div className="space-y-6">
      <div className="hero-panel p-6">
        <p className="section-title">{APP_BRAND.shortName}</p>
        <h1 className="mt-1 text-2xl font-semibold">Saved Vendors</h1>
        <p className="text-sm text-muted-foreground">Compliance outcomes and important dates, organized for fast follow-up.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <div className="metric-panel p-3">
            <p className="text-xs text-muted-foreground">Total Vendors</p>
            <p className="mt-1 text-2xl font-semibold">{cards.length}</p>
          </div>
          <div className="metric-panel border-amber-300/60 bg-amber-50/70 p-3">
            <p className="text-xs text-amber-800">Dates Due Soon (30d)</p>
            <p className="mt-1 text-2xl font-semibold text-amber-900">{expiringSoonTotal}</p>
          </div>
          <div className="metric-panel border-rose-300/60 bg-rose-50/70 p-3">
            <p className="text-xs text-rose-800">Expired Dates</p>
            <p className="mt-1 text-2xl font-semibold text-rose-900">{flaggedTotal}</p>
          </div>
          <div className="metric-panel border-slate-300/60 bg-slate-50/80 p-3">
            <p className="text-xs text-slate-700">Historical (Issue/Registration)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{historicalTotal}</p>
          </div>
          <div className="metric-panel border-zinc-300/70 bg-zinc-50/80 p-3">
            <p className="text-xs text-zinc-700">Unlabeled Dates</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{unlabeledTotal}</p>
          </div>
        </div>
      </div>

      <form method="get" className="max-w-sm">
        <Input name="search" defaultValue={search} placeholder="Search vendor name" autoComplete="off" />
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((vendor) => (
          <Card key={vendor.id} className="panel-hover border border-border/70 bg-white/92">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-lg">{vendor.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Link href={`/vendors/${vendor.id}`} className="text-sm text-primary underline-offset-4 hover:underline">
                    Open
                  </Link>
                  <form action={`/api/vendors/${vendor.id}/delete`} method="post">
                    <Button size="sm" variant="destructive" type="submit">
                      Delete
                    </Button>
                  </form>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Updated {new Date(vendor.updated_at).toLocaleString()}</p>
              <div className="flex flex-wrap gap-2">
                {typeof vendor.contact.email === "string" ? <Badge variant="outline">Email: {vendor.contact.email}</Badge> : null}
                {typeof vendor.contact.phone === "string" ? <Badge variant="outline">Phone: {vendor.contact.phone}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-semibold text-muted-foreground">Important Dates</p>
              {vendor.importantDates.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {vendor.importantDates.slice(0, 4).map((date) => (
                    <li key={`${vendor.id}-${date.label}-${date.value}`} className="flex items-center justify-between rounded-md border bg-white p-2">
                      <div>
                        <p className="text-sm font-medium">{date.label}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(date.value)}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          date.state === "expired"
                            ? "border-rose-400/60 bg-rose-50 text-rose-700"
                            : date.state === "due_soon"
                              ? "border-amber-400/60 bg-amber-50 text-amber-800"
                              : date.state === "historical"
                                ? "border-slate-400/60 bg-slate-50 text-slate-700"
                                : "border-emerald-400/60 bg-emerald-50 text-emerald-700"
                        }
                      >
                        {relativeText(date.state, date.daysDelta)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No important dates found in latest compliance data.</p>
              )}
              {vendor.unlabeledCount > 0 ? (
                <p className="mt-2 text-xs text-zinc-700">
                  {vendor.unlabeledCount} unlabeled/undetected date{vendor.unlabeledCount > 1 ? "s" : ""} available in vendor details.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {(cards.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No vendors saved yet.</p> : null}
    </div>
  );
}
