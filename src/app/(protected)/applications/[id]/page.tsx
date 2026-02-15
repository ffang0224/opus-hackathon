"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { APP_BRAND } from "@/lib/branding";
import type { ApplicationStatus, NotificationCategory } from "@/lib/types/app";
import { flattenResults } from "@/lib/workflow/renderers";
import type { WorkflowVariable } from "@/lib/workflow/types";

type ApplicationResponse = {
  application: {
    id: string;
    vendor_name: string;
    status: ApplicationStatus;
    contact_json: Record<string, unknown> | null;
    result_json: Record<string, unknown> | null;
    reviewer_comment: string | null;
    created_at: string;
    updated_at: string;
  };
  documents: Array<{
    id: string;
    input_key: string;
    filename: string;
    signed_url: string | null;
    created_at: string;
  }>;
  notifications: Array<{
    id: string;
    category: NotificationCategory;
    recipient_email: string | null;
    message: string;
    is_read: boolean;
    created_at: string;
  }>;
  audit: Array<{
    id: string;
    action: string;
    meta: Record<string, unknown> | null;
    created_at: string;
  }>;
  latestJobExecutionId: string | null;
};

type WorkflowSchemaResponse = {
  jobPayloadSchema: Record<string, WorkflowVariable>;
  jobResultsPayloadSchema: Record<string, WorkflowVariable>;
  opus: {
    enabled: boolean;
    mode: "live" | "manual";
    reason?: string;
  };
};

type PortalView = "vendor" | "admin" | "combined";

function resultToneClasses(tone: "pass" | "issue" | "neutral") {
  if (tone === "pass") return "border-emerald-300/70 bg-emerald-50/80";
  if (tone === "issue") return "border-amber-300/70 bg-amber-50/80";
  return "border-border bg-white";
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const applicationId = params.id;
  const portalView = useMemo<PortalView>(() => {
    const view = searchParams.get("view");
    if (view === "vendor" || view === "admin") return view;
    return "combined";
  }, [searchParams]);

  const [lane, setLane] = useState<"submit" | "review">("submit");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<ApplicationResponse | null>(null);
  const [inputSchema, setInputSchema] = useState<Record<string, WorkflowVariable>>({});
  const [resultSchema, setResultSchema] = useState<Record<string, WorkflowVariable>>({});
  const [opusConfig, setOpusConfig] = useState<WorkflowSchemaResponse["opus"]>({ enabled: false, mode: "manual" });
  const [manualJson, setManualJson] = useState("");
  const [reviewerComment, setReviewerComment] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [category, setCategory] = useState<NotificationCategory>("vendor");
  const [notificationFilter, setNotificationFilter] = useState<"all" | NotificationCategory>("all");
  const [jobExecutionId, setJobExecutionId] = useState("");
  const [jobStatus, setJobStatus] = useState<string>("");
  const [lastStatusCheckAt, setLastStatusCheckAt] = useState<string | null>(null);
  const [auditLogJson, setAuditLogJson] = useState<Record<string, unknown> | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [appResponse, workflowResponse] = await Promise.all([
      fetch(`/api/applications/${applicationId}`),
      fetch("/api/workflow/schema")
    ]);

    const appData = await appResponse.json();
    const workflowData = (await workflowResponse.json()) as WorkflowSchemaResponse;

    if (!appResponse.ok) {
      setError(appData.error ?? "Failed to load application.");
      setLoading(false);
      return;
    }

    setData(appData as ApplicationResponse);
    setInputSchema(workflowData.jobPayloadSchema ?? {});
    setResultSchema(workflowData.jobResultsPayloadSchema ?? {});
    setOpusConfig(workflowData.opus ?? { enabled: false, mode: "manual" });
    setReviewerComment((appData as ApplicationResponse).application.reviewer_comment ?? "");
    setJobExecutionId((prev) => prev || (appData as ApplicationResponse).latestJobExecutionId || "");
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applicationStatus = data?.application.status;

  useEffect(() => {
    if (portalView === "vendor") {
      setLane("submit");
      return;
    }
    if (portalView === "admin") {
      setLane("review");
      return;
    }
    if (!applicationStatus) return;
    setLane(applicationStatus === "draft" ? "submit" : "review");
  }, [applicationStatus, portalView]);

  const flattenedResults = useMemo(() => {
    return flattenResults(resultSchema, data?.application.result_json ?? null);
  }, [resultSchema, data?.application.result_json]);
  const hasSavedResultJson = useMemo(() => {
    if (!data?.application.result_json) return false;
    return Object.keys(data.application.result_json).length > 0;
  }, [data?.application.result_json]);
  const filteredNotifications = useMemo(() => {
    if (!data) return [];
    if (notificationFilter === "all") return data.notifications;
    return data.notifications.filter((notification) => notification.category === notificationFilter);
  }, [data, notificationFilter]);

  useEffect(() => {
    const shouldAutoStart =
      Boolean(data) &&
      data!.application.status !== "draft" &&
      !hasSavedResultJson &&
      !jobExecutionId &&
      opusConfig.enabled &&
      !busyAction;

    if (!shouldAutoStart) return;

    void runLiveOpus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.application.status, hasSavedResultJson, jobExecutionId, opusConfig.enabled]);

  useEffect(() => {
    const shouldPoll =
      Boolean(data) &&
      data!.application.status !== "draft" &&
      Boolean(jobExecutionId) &&
      !hasSavedResultJson &&
      jobStatus !== "FAILED";
    if (!shouldPoll) return;

    void checkStatus({ quiet: true });

    const timer = window.setInterval(() => {
      void checkStatus({ quiet: true });
    }, 9000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.application.status, jobExecutionId, hasSavedResultJson, jobStatus]);

  async function submitFromDetail() {
    setNotice(null);
    setBusyAction("submit");
    const response = await fetch(`/api/applications/${applicationId}/submit`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to submit application.");
    } else {
      if (payload.review?.started && payload.review?.jobExecutionId) {
        setJobExecutionId(payload.review.jobExecutionId);
        setJobStatus("IN PROGRESS");
        setLastStatusCheckAt(new Date().toISOString());
        setNotice("Application submitted. Compliance review started.");
      }
      await load();
      if (payload.review?.started === false && payload.review?.reason) {
        setError(`Submission succeeded, but automatic review did not start: ${payload.review.reason}`);
      } else if (payload.review?.started !== false) {
        setNotice("Application submitted successfully.");
      }
    }
    setBusyAction(null);
  }

  async function decideApplication(decision: "approved" | "rejected") {
    setNotice(null);
    setBusyAction(decision);
    const response = await fetch(`/api/applications/${applicationId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        reviewerComment: reviewerComment.trim() || undefined
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to save admin decision.");
    } else {
      setError(null);
      setNotice(decision === "approved" ? "Vendor approved and saved." : "Vendor disapproved and saved.");
      await load();
    }
    setBusyAction(null);
  }

  async function saveAsVendor() {
    setNotice(null);
    setBusyAction("save-vendor");
    const response = await fetch(`/api/applications/${applicationId}/save-vendor`, {
      method: "POST"
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to save vendor.");
    } else {
      setError(null);
      setNotice("Vendor profile saved to registry.");
      await load();
    }
    setBusyAction(null);
  }

  async function sendNotification() {
    setNotice(null);
    setBusyAction("notification");
    const response = await fetch(`/api/applications/${applicationId}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        message: messageDraft,
        recipientEmail: category === "vendor" ? recipientEmail || undefined : undefined
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to create notification.");
    } else {
      setMessageDraft("");
      setNotice("Notification created.");
      await load();
    }

    setBusyAction(null);
  }

  async function markAdminNotificationRead(notificationId: string, isRead: boolean) {
    setBusyAction(`read-${notificationId}`);
    const response = await fetch(`/api/applications/${applicationId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId,
        isRead
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to update notification.");
    } else {
      await load();
    }
    setBusyAction(null);
  }

  async function deleteNotification(notificationId: string) {
    setBusyAction(`delete-${notificationId}`);
    const response = await fetch(`/api/applications/${applicationId}/notifications`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId })
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete notification.");
    } else {
      await load();
    }
    setBusyAction(null);
  }

  async function saveManualResults() {
    setNotice(null);
    setBusyAction("manual");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(manualJson) as Record<string, unknown>;
    } catch {
      setError("Invalid JSON in manual mode.");
      setBusyAction(null);
      return;
    }

    const response = await fetch(`/api/applications/${applicationId}/opus/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualResultJson: parsed })
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to save manual results.");
    } else {
      setManualJson("");
      setNotice("Manual results saved.");
      await load();
    }

    setBusyAction(null);
  }

  async function runLiveOpus() {
    setNotice(null);
    setBusyAction("run");
    const response = await fetch(`/api/applications/${applicationId}/opus/run`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to start compliance job.");
    } else {
      setJobExecutionId(payload.jobExecutionId);
      setJobStatus("IN PROGRESS");
      setLastStatusCheckAt(new Date().toISOString());
      setAuditLogJson(null);
      setNotice("Compliance review started.");
    }
    setBusyAction(null);
  }

  async function fetchLiveResults(jobId?: string, quiet = false) {
    const resolvedJobId = jobId ?? jobExecutionId;
    if (!resolvedJobId) return;
    if (!quiet) setBusyAction("results");
    const response = await fetch(`/api/applications/${applicationId}/opus/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobExecutionId: resolvedJobId })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to fetch results.");
    } else {
      if (!quiet) {
        setNotice("Results synced.");
      }
      await load();
    }
    if (!quiet) setBusyAction(null);
  }

  async function checkStatus({ quiet = false }: { quiet?: boolean } = {}) {
    if (!jobExecutionId) return;
    if (!quiet) setBusyAction("status");
    const response = await fetch(`/api/applications/${applicationId}/opus/status?jobExecutionId=${encodeURIComponent(jobExecutionId)}`);
    const payload = await response.json();
    if (!response.ok) {
      if (!quiet) {
        setError(payload.error ?? "Status check failed.");
      }
    } else {
      const status = String(payload.status ?? "");
      setJobStatus(status);
      setLastStatusCheckAt(new Date().toISOString());

      if (status === "COMPLETED" && !hasSavedResultJson && !quiet) {
        await fetchLiveResults(payload.jobExecutionId ?? jobExecutionId, false);
      }

      if (status === "COMPLETED" && !hasSavedResultJson && quiet) {
        await fetchLiveResults(payload.jobExecutionId ?? jobExecutionId, true);
      }
    }
    if (!quiet) setBusyAction(null);
  }

  async function fetchAuditLog() {
    if (!jobExecutionId) return;
    setNotice(null);
    setBusyAction("audit");
    const response = await fetch(
      `/api/applications/${applicationId}/opus/audit?jobExecutionId=${encodeURIComponent(jobExecutionId)}`
    );
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Failed to fetch backend audit log.");
    } else {
      setAuditLogJson((payload.audit ?? null) as Record<string, unknown> | null);
      setNotice("Execution audit log loaded.");
    }
    setBusyAction(null);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-destructive">{error ?? "Application not found."}</p>;
  }

  const isSubmitStage = data.application.status === "draft";
  const isReviewStage = !isSubmitStage;
  const hasReviewResult = flattenedResults.length > 0;
  const hasJobId = jobExecutionId.length > 0;
  const autoSyncEnabled = isReviewStage && hasJobId && !hasSavedResultJson;
  const showVendorLane = portalView !== "admin";
  const showAdminLane = portalView !== "vendor";
  const canManageNotifications = portalView !== "vendor";
  const backHref =
    portalView === "vendor" ? "/vendor/applications" : portalView === "admin" ? "/admin/applications" : "/applications";
  const requiredFileInputKeys = Object.entries(inputSchema)
    .filter(([, variable]) => variable.type === "file" && !variable.is_nullable)
    .map(([key]) => key);
  const fileInputsPresent = requiredFileInputKeys.every((key) => data.documents.some((doc) => doc.input_key === key));
  const contact = (data.application.contact_json ?? {}) as Record<string, unknown>;
  const requiredContactKeys = Object.entries(inputSchema)
    .filter(([, variable]) => variable.type === "object")
    .flatMap(([, variable]) => {
      const fields = variable.type_definition;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        return [];
      }
      const typedFields = fields as Record<string, WorkflowVariable>;
      return Object.entries(typedFields)
        .filter(([, field]) => !field.is_nullable)
        .map(([fieldKey]) => fieldKey);
    });
  const contactReady = requiredContactKeys.every((key) => typeof contact[key] === "string" && String(contact[key]).trim().length > 0);

  const workflowChecklist = [
    { title: "Collect Files", done: fileInputsPresent },
    { title: "Submit Application", done: isReviewStage, active: isSubmitStage },
    { title: "Run Compliance Review", done: hasReviewResult || jobStatus === "COMPLETED", active: isReviewStage && !hasReviewResult },
    {
      title: "Compliance Decision",
      done: ["approved", "rejected"].includes(data.application.status),
      active: data.application.status === "reviewed"
    },
    { title: "Notify Stakeholders", done: data.notifications.length > 0 }
  ];

  return (
    <div className="space-y-6">
      <div className="hero-panel panel-hover p-6">
        <p className="section-title">{APP_BRAND.shortName}</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{data.application.vendor_name}</h1>
            <p className="text-sm text-muted-foreground">Application #{data.application.id}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {portalView === "vendor"
                ? "Vendor view: upload files, submit, and track progress."
                : portalView === "admin"
                  ? "Admin view: monitor compliance checks and finalize approval decisions."
                  : "Combined view: switch between Submit and Review lanes."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Demo note: vendor and admin workflows are shown together in one dashboard for this prototype.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={data.application.status} />
            <form action={`/api/applications/${data.application.id}/delete`} method="post">
              <Button size="sm" variant="destructive" type="submit">
                Delete
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-5">
          {workflowChecklist.map((item) => (
            <div
              key={item.title}
              className={`rounded-lg border px-3 py-2 text-xs ${
                item.done
                  ? "border-emerald-400/60 bg-emerald-50/80"
                  : item.active
                    ? "border-primary/45 bg-blue-50/70"
                    : "bg-white/82"
              }`}
            >
              <p className="font-semibold">{item.title}</p>
            </div>
          ))}
        </div>
      </div>

      {portalView === "combined" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setLane("submit")}
            className={`rounded-xl border p-4 text-left transition panel-hover ${
              lane === "submit" ? "border-primary/45 bg-blue-50/70" : "bg-white/82"
            }`}
          >
            <p className="section-title">Lane 1</p>
            <p className="text-lg font-semibold">Vendor: Submit Files</p>
            <p className="text-sm text-muted-foreground">Upload documents, provide contact details, then send for review.</p>
          </button>

          <button
            type="button"
            onClick={() => setLane("review")}
            className={`rounded-xl border p-4 text-left transition panel-hover ${
              lane === "review" ? "border-primary/45 bg-blue-50/70" : "bg-white/82"
            }`}
          >
            <p className="section-title">Lane 2</p>
            <p className="text-lg font-semibold">Admin: Review & Decide</p>
            <p className="text-sm text-muted-foreground">Run checks, review results, then approve or disapprove.</p>
          </button>
        </div>
      ) : (
        <div className="rounded-xl border bg-white/85 p-4">
          <p className="text-sm text-muted-foreground">
            {portalView === "vendor"
              ? "Viewing vendor-only actions. Switch to Admin Review tab to decide approvals."
              : "Viewing admin-only actions. Switch to Vendor Portal tab to manage submission inputs."}
          </p>
        </div>
      )}

      {busyAction ? (
        <div className="rounded-md border bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Processing action: {busyAction}
          </span>
        </div>
      ) : null}

      {notice ? <p className="rounded-md border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}

      {showVendorLane && lane === "submit" ? (
        <div className="grid gap-6 lg:grid-cols-2 fade-slide-up">
          <Card className="panel-hover border border-border/70 bg-white/92">
            <CardHeader>
              <CardTitle>Submit Readiness</CardTitle>
              <CardDescription>Complete these before sending the application to Review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className={`rounded-md border p-3 ${fileInputsPresent ? "border-emerald-300 bg-emerald-50" : ""}`}>
                <p className="font-medium">Required documents</p>
                <p className="text-muted-foreground">Business License, Tax Registration, Bank Details proof.</p>
              </div>
              <div className={`rounded-md border p-3 ${contactReady ? "border-emerald-300 bg-emerald-50" : ""}`}>
                <p className="font-medium">UAE contact info</p>
                <p className="text-muted-foreground">Email, phone, and address must be present.</p>
              </div>

              {isSubmitStage ? (
                <Button onClick={submitFromDetail} disabled={busyAction !== null || !fileInputsPresent || !contactReady}>
                  {busyAction === "submit" ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit Application"
                  )}
                </Button>
              ) : (
                <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Application already submitted. Continue in Review lane.
                </p>
              )}

              <Link href="/applications/new?portal=vendor" className="text-sm text-primary underline-offset-4 hover:underline">
                Need to edit files? Use submission wizard
              </Link>
            </CardContent>
          </Card>

          <Card className="panel-hover border border-border/70 bg-white/92">
            <CardHeader>
              <CardTitle>Current Submission Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium">Contact</p>
                <pre className="mt-2 whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
                  {JSON.stringify(data.application.contact_json ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-sm font-medium">Documents</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {data.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between rounded border bg-white p-2">
                      <span>{doc.filename}</span>
                      {doc.signed_url ? (
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Unavailable</span>
                      )}
                    </li>
                  ))}
                  {data.documents.length === 0 ? <li className="text-muted-foreground">No documents uploaded yet.</li> : null}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showAdminLane && lane === "review" ? (
        <div className="grid gap-6 lg:grid-cols-2 fade-slide-up">
          <Card className="panel-hover border border-border/70 bg-white/92">
            <CardHeader>
              <CardTitle>Admin Review Controls</CardTitle>
              <CardDescription>
                Review is now automatic: submit starts processing, this page polls status, and results are saved once completed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Execution logic</p>
                <p className="mt-1">
                  Upload files, submit application, and open this page. It will keep checking until completion, then save
                  results automatically.
                </p>
              </div>

              {!isReviewStage ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  Submit application first before using Review lane.
                </p>
              ) : null}

              <div className="rounded border p-3">
                <p className="text-sm font-medium">1) Review Job</p>
                {opusConfig.enabled ? (
                  <div className="mt-2 space-y-2">
                    {jobExecutionId ? (
                      <p className="text-xs text-muted-foreground">
                        Job ID: <span className="font-mono">{jobExecutionId}</span>
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          No job found yet. It will start automatically once submission is processed.
                        </p>
                        <Button size="sm" onClick={runLiveOpus} disabled={busyAction !== null || !isReviewStage}>
                          {busyAction === "run" ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Starting...
                            </span>
                          ) : (
                            "Start Manually"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Compliance backend integration requires docs configuration.</p>
                )}
              </div>

              <div className="rounded border p-3">
                <p className="text-sm font-medium">2) Check Status</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => checkStatus()}
                    disabled={!hasJobId || busyAction !== null || !isReviewStage}
                  >
                    {busyAction === "status" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Checking...
                      </span>
                    ) : (
                      "Check Status"
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {autoSyncEnabled ? "Auto-sync is active (checks every ~9s)." : "Auto-sync idle."}
                  </p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Current status: {jobStatus || "N/A"}</p>
                {lastStatusCheckAt ? (
                  <p className="text-xs text-muted-foreground">Last checked: {new Date(lastStatusCheckAt).toLocaleTimeString()}</p>
                ) : null}
                {jobStatus === "FAILED" ? (
                  <Button className="mt-2" size="sm" variant="outline" onClick={runLiveOpus} disabled={busyAction !== null || !isReviewStage}>
                    Restart Review Job
                  </Button>
                ) : null}
              </div>

              <div className="rounded border p-3">
                <p className="text-sm font-medium">3) Results Sync</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fetchLiveResults(undefined, false)}
                    disabled={!hasJobId || busyAction !== null || !isReviewStage}
                  >
                    {busyAction === "results" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Fetching...
                      </span>
                    ) : (
                      "Sync Results Now"
                    )}
                  </Button>
                  <Button size="sm" variant="outline" onClick={fetchAuditLog} disabled={!hasJobId || busyAction !== null || !isReviewStage}>
                    {busyAction === "audit" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      "Get Job Audit Log"
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Results are auto-saved when status becomes COMPLETED. Use Sync Results only for manual retry.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="panel-hover border border-border/70 bg-white/92">
            <CardHeader>
              <CardTitle>Decision Panel</CardTitle>
              <CardDescription>Review the findings, set your decision, and sync to the vendor registry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded border p-3">
                <label className="text-sm font-medium">Reviewer Comment (optional)</label>
                <Textarea
                  className="mt-2"
                  rows={3}
                  placeholder="Reasoning for approval/disapproval"
                  value={reviewerComment}
                  onChange={(event) => setReviewerComment(event.target.value)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => decideApplication("approved")}
                    disabled={busyAction !== null || !isReviewStage}
                  >
                    {busyAction === "approved" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      "Approve Vendor"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => decideApplication("rejected")}
                    disabled={busyAction !== null || !isReviewStage}
                  >
                    {busyAction === "rejected" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      "Disapprove Vendor"
                    )}
                  </Button>
                  <Button size="sm" variant="outline" onClick={saveAsVendor} disabled={busyAction !== null || !isReviewStage}>
                    {busyAction === "save-vendor" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      "Save to Vendors"
                    )}
                  </Button>
                </div>
              </div>

              <div className="rounded border p-3">
                <p className="text-sm font-medium">Result Summary</p>
                {flattenedResults.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {flattenedResults.map((item) => (
                      <div key={item.key} className={`rounded border p-2 ${resultToneClasses(item.tone)}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{item.label}</p>
                          <Badge
                            variant="outline"
                            className={
                              item.tone === "pass"
                                ? "border-emerald-500/40 text-emerald-700"
                                : item.tone === "issue"
                                  ? "border-amber-500/40 text-amber-800"
                                  : "text-muted-foreground"
                            }
                          >
                            {item.tone === "pass" ? "Pass" : item.tone === "issue" ? "Review" : "Info"}
                          </Badge>
                        </div>
                        <pre className="mt-1 whitespace-pre-wrap break-all text-muted-foreground">{item.value}</pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground">No compliance result available yet.</p>
                )}
              </div>

              <details className="rounded border p-3">
                <summary className="cursor-pointer text-sm font-medium">Manual Result Fallback (Optional)</summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Use this only if automatic processing is unavailable and you need to paste verified JSON manually.
                </p>
                <Textarea
                  className="mt-2"
                  rows={6}
                  placeholder="Paste compliance result JSON"
                  value={manualJson}
                  onChange={(event) => setManualJson(event.target.value)}
                />
                <Button
                  className="mt-2"
                  size="sm"
                  onClick={saveManualResults}
                  disabled={busyAction !== null || !manualJson || !isReviewStage}
                >
                  {busyAction === "manual" ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Manual Result"
                  )}
                </Button>
              </details>

              {hasJobId ? (
                <details className="rounded border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Execution Audit (Optional)</summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    This is raw audit output from the compliance backend for traceability/debugging.
                  </p>
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-xs text-muted-foreground">
                    {auditLogJson ? JSON.stringify(auditLogJson, null, 2) : "No audit log loaded yet. Use 'Get Job Audit Log'."}
                  </pre>
                </details>
              ) : null}

              <div className="rounded border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Decisions are saved with your comment and vendor is added to your list automatically in this demo.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="panel-hover border border-border/70 bg-white/92">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Generated updates and manual notes for vendor/admin communication.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">Filter:</p>
            <Button size="sm" variant={notificationFilter === "all" ? "default" : "outline"} onClick={() => setNotificationFilter("all")}>
              All
            </Button>
            <Button
              size="sm"
              variant={notificationFilter === "vendor" ? "default" : "outline"}
              onClick={() => setNotificationFilter("vendor")}
            >
              Vendor
            </Button>
            <Button
              size="sm"
              variant={notificationFilter === "admin" ? "default" : "outline"}
              onClick={() => setNotificationFilter("admin")}
            >
              Admin
            </Button>
          </div>

          <div className="space-y-2 pt-1">
            {filteredNotifications.map((item) => (
              <div key={item.id} className="rounded border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {item.category.toUpperCase()} {item.category === "admin" ? `(${item.is_read ? "read" : "unread"})` : ""}
                  </p>
                  <span className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                {item.recipient_email ? <p className="text-muted-foreground">To: {item.recipient_email}</p> : null}
                <p className="mt-1 whitespace-pre-wrap">{item.message}</p>
                {canManageNotifications ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.category === "admin" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markAdminNotificationRead(item.id, !item.is_read)}
                        disabled={busyAction !== null}
                      >
                        {busyAction === `read-${item.id}` ? "Updating..." : item.is_read ? "Mark Unread" : "Mark Read"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteNotification(item.id)}
                      disabled={busyAction !== null}
                    >
                      {busyAction === `delete-${item.id}` ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {filteredNotifications.length === 0 ? (
              <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">No notifications for this filter.</p>
            ) : null}
          </div>

          {canManageNotifications ? (
            <details className="rounded border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add Manual Notification (Optional)</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <select
                    className="h-10 w-full rounded-lg border border-input/90 bg-background/85 px-3 text-sm"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as NotificationCategory)}
                  >
                    <option value="vendor">Vendor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {category === "vendor" ? (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Recipient Email</label>
                    <Input
                      placeholder="vendor@example.com"
                      value={recipientEmail}
                      onChange={(event) => setRecipientEmail(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="mt-3 space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} rows={4} />
              </div>
              <Button className="mt-3" onClick={sendNotification} disabled={busyAction !== null || !messageDraft || !isReviewStage}>
                {busyAction === "notification" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Create Notification"
                )}
              </Button>
            </details>
          ) : null}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Link href={backHref} className="text-sm text-primary underline-offset-4 hover:underline">
        Back to applications
      </Link>
    </div>
  );
}
