import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleHelp, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_BRAND } from "@/lib/branding";
import { normalizeResultsPayload } from "@/lib/workflow/normalize-results";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ImportantDate = {
  label: string;
  value: string;
  state: "expired" | "due_soon" | "upcoming" | "historical" | "unlabeled";
  daysDelta: number;
  monthKey: string;
};

type SignalTone = "pass" | "warning" | "critical" | "neutral";

type ReviewSignal = {
  key: string;
  value: string;
  tone: SignalTone;
  toneLabel: string;
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

function relativeText(state: ImportantDate["state"], daysDelta: number) {
  if (state === "unlabeled") return "unlabeled";
  if (state === "historical") return `recorded ${Math.abs(daysDelta)} days ago`;
  if (daysDelta < 0) return `${Math.abs(daysDelta)} days ago`;
  if (daysDelta === 0) return "today";
  return `in ${daysDelta} days`;
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
      const iso = typeof value.date_value === "string" ? value.date_value : null;
      if (!iso) return null;
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return null;

      const daysDelta = Math.round((toMidnight(parsed) - today) / (1000 * 60 * 60 * 24));
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
        value: iso,
        state,
        daysDelta,
        monthKey: parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      } satisfies ImportantDate;
    })
    .filter(Boolean) as ImportantDate[];

  return items.sort((a, b) => new Date(a.value).getTime() - new Date(b.value).getTime());
}

function extractStatusAndReasons(input: unknown) {
  if (!input || typeof input !== "object") return [];
  const normalized = normalizeResultsPayload(input as Record<string, unknown>);
  const items = Object.entries(normalized)
    .filter(([key, value]) => {
      if (typeof value !== "string") return false;
      const normalizedKey = key.toLowerCase();
      return normalizedKey.includes("status") || normalizedKey.includes("reason");
    })
    .map(([key, value]) => {
      const text = String(value).trim();
      const keyLower = key.toLowerCase();
      const lower = text.toLowerCase();

      const isReasonField = keyLower.includes("reason");
      if (isReasonField && !text) {
        return { key, value: "No issue detected.", tone: "pass", toneLabel: "Clear" } satisfies ReviewSignal;
      }

      const criticalTokens = [
        "mismatch",
        "flagged",
        "inconsistency",
        "invalid",
        "reject",
        "failed",
        "missing",
        "fraud",
        "tamper"
      ];
      const warningTokens = ["review", "pending", "unknown", "manual", "unclear", "incomplete", "check"];
      const passTokens = ["valid", "compliant", "approved", "pass", "authentic", "verified", "clear", "match"];

      const hasCritical = criticalTokens.some((token) => lower.includes(token));
      const hasWarning = warningTokens.some((token) => lower.includes(token));
      const hasPass = passTokens.some((token) => lower.includes(token));

      if (hasCritical) {
        return { key, value: text || "-", tone: "critical", toneLabel: "Critical" } satisfies ReviewSignal;
      }
      if (hasWarning) {
        return { key, value: text || "-", tone: "warning", toneLabel: "Attention" } satisfies ReviewSignal;
      }
      if (hasPass) {
        return { key, value: text || "-", tone: "pass", toneLabel: "Pass" } satisfies ReviewSignal;
      }
      return { key, value: text || "-", tone: "neutral", toneLabel: "Needs Review" } satisfies ReviewSignal;
    });
  return items;
}

export default async function VendorDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id,name,contact_json,latest_compliance_json,created_at,updated_at")
    .eq("id", params.id)
    .eq("created_by", user.id)
    .single();

  if (error || !vendor) {
    notFound();
  }

  const contact = vendor.contact_json && typeof vendor.contact_json === "object" ? (vendor.contact_json as Record<string, unknown>) : {};
  const allDates = extractImportantDates(vendor.latest_compliance_json);
  const importantDates = allDates.filter((date) => date.state !== "unlabeled");
  const unlabeledDates = allDates.filter((date) => date.state === "unlabeled");
  const statusAndReasons = extractStatusAndReasons(vendor.latest_compliance_json);
  const signalCounts = statusAndReasons.reduce(
    (acc, signal) => {
      acc[signal.tone] += 1;
      return acc;
    },
    { pass: 0, warning: 0, critical: 0, neutral: 0 } as Record<SignalTone, number>
  );

  const monthGroups = importantDates.reduce<Record<string, ImportantDate[]>>((groups, entry) => {
    groups[entry.monthKey] = groups[entry.monthKey] ?? [];
    groups[entry.monthKey].push(entry);
    return groups;
  }, {});

  return (
    <div className="space-y-6">
      <div className="hero-panel p-6">
        <p className="section-title">{APP_BRAND.shortName}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{vendor.name}</h1>
            <p className="text-sm text-muted-foreground">
              Last updated {new Date(vendor.updated_at).toLocaleString()} • Created {new Date(vendor.created_at).toLocaleDateString()}
            </p>
          </div>
          <form action={`/api/vendors/${vendor.id}/delete`} method="post">
            <Button size="sm" variant="destructive" type="submit">
              Delete Vendor
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="panel-hover border border-border/70 bg-white/92">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{typeof contact.email === "string" ? contact.email : "-"}</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="font-medium">{typeof contact.phone === "string" ? contact.phone : "-"}</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="font-medium">{typeof contact.address === "string" ? contact.address : "-"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="panel-hover border border-border/70 bg-white/92">
          <CardHeader>
            <CardTitle>Review Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statusAndReasons.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-md border border-emerald-300/70 bg-emerald-50/70 p-2">
                    <p className="text-xs text-emerald-800">Pass</p>
                    <p className="text-lg font-semibold text-emerald-900">{signalCounts.pass}</p>
                  </div>
                  <div className="rounded-md border border-amber-300/70 bg-amber-50/70 p-2">
                    <p className="text-xs text-amber-800">Attention</p>
                    <p className="text-lg font-semibold text-amber-900">{signalCounts.warning}</p>
                  </div>
                  <div className="rounded-md border border-rose-300/70 bg-rose-50/70 p-2">
                    <p className="text-xs text-rose-800">Critical</p>
                    <p className="text-lg font-semibold text-rose-900">{signalCounts.critical}</p>
                  </div>
                  <div className="rounded-md border border-slate-300/70 bg-slate-50/70 p-2">
                    <p className="text-xs text-slate-700">Needs Review</p>
                    <p className="text-lg font-semibold text-slate-900">{signalCounts.neutral}</p>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  {statusAndReasons.map((item) => (
                    <div
                      key={item.key}
                      className={`rounded-md border p-3 ${
                        item.tone === "pass"
                          ? "border-emerald-300/70 bg-emerald-50/65"
                          : item.tone === "warning"
                            ? "border-amber-300/70 bg-amber-50/65"
                            : item.tone === "critical"
                              ? "border-rose-300/70 bg-rose-50/65"
                              : "border-slate-300/70 bg-slate-50/65"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-muted-foreground">{item.key.replace(/_/g, " ")}</p>
                        <Badge
                          variant="outline"
                          className={
                            item.tone === "pass"
                              ? "border-emerald-400/60 bg-emerald-50 text-emerald-700"
                              : item.tone === "warning"
                                ? "border-amber-400/60 bg-amber-50 text-amber-800"
                                : item.tone === "critical"
                                  ? "border-rose-400/60 bg-rose-50 text-rose-700"
                                  : "border-slate-400/60 bg-slate-50 text-slate-700"
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            {item.tone === "pass" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                            {item.tone === "warning" ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                            {item.tone === "critical" ? <ShieldAlert className="h-3.5 w-3.5" /> : null}
                            {item.tone === "neutral" ? <CircleHelp className="h-3.5 w-3.5" /> : null}
                            {item.toneLabel}
                          </span>
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No status/reason fields found in latest compliance data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="panel-hover border border-border/70 bg-white/92">
        <CardHeader>
          <CardTitle>Important Dates Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {importantDates.length > 0 ? (
            <ul className="space-y-2">
              {importantDates.map((date) => (
                <li key={`${date.label}-${date.value}`} className="flex items-center justify-between rounded-lg border bg-white p-3">
                  <div>
                    <p className="font-medium">{date.label}</p>
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
            <p className="text-sm text-muted-foreground">No important dates available in this vendor record.</p>
          )}
        </CardContent>
      </Card>

      <Card className="panel-hover border border-border/70 bg-white/92">
        <CardHeader>
          <CardTitle>Calendar View</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(monthGroups).length > 0 ? (
            Object.entries(monthGroups).map(([month, entries]) => (
              <div key={month} className="rounded-lg border bg-white p-3">
                <p className="text-sm font-semibold">{month}</p>
                <div className="mt-2 space-y-2">
                  {entries.map((entry) => (
                    <div key={`${month}-${entry.label}-${entry.value}`} className="rounded-md border bg-muted/20 p-2 text-xs">
                      <p className="font-medium">{entry.label}</p>
                      <p className="text-muted-foreground">{formatDate(entry.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No calendar events yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="panel-hover border border-border/70 bg-white/92">
        <CardHeader>
          <CardTitle>Unlabeled / Undetected Dates</CardTitle>
        </CardHeader>
        <CardContent>
          <details className="rounded-lg border bg-zinc-50/70 p-3">
            <summary className="cursor-pointer text-sm font-medium text-zinc-900">
              Show {unlabeledDates.length} unlabeled date{unlabeledDates.length === 1 ? "" : "s"}
            </summary>
            <p className="mt-2 text-xs text-zinc-700">
              These dates were returned as `Other` or without a clear label. They are cataloged separately as unlabeled/undetected data.
            </p>
            {unlabeledDates.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {unlabeledDates.map((date, index) => (
                  <li key={`${date.value}-${index}`} className="flex items-center justify-between rounded-md border bg-white p-2">
                    <div>
                      <p className="text-sm font-medium">Unknown Date</p>
                      <p className="text-xs text-muted-foreground">{formatDate(date.value)}</p>
                    </div>
                    <Badge variant="outline" className="border-zinc-400/60 bg-zinc-50 text-zinc-700">
                      {relativeText(date.state, date.daysDelta)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No unlabeled dates found.</p>
            )}
          </details>
        </CardContent>
      </Card>

      <Card className="panel-hover border border-border/70 bg-white/92">
        <CardHeader>
          <CardTitle>Raw Compliance JSON</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
            {JSON.stringify(vendor.latest_compliance_json ?? {}, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Link href="/vendors" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to vendors
      </Link>
    </div>
  );
}
