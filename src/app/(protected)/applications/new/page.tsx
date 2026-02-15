"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { APP_BRAND } from "@/lib/branding";
import type { WorkflowVariable } from "@/lib/workflow/types";

type WorkflowResponse = {
  jobPayloadSchema: Record<string, WorkflowVariable>;
};

const steps = [
  { id: 1, title: "Vendor" },
  { id: 2, title: "Files & Contact" },
  { id: 3, title: "Submit" }
];

const DEMO_CONTACT_DEFAULTS = {
  email: "jv@zenithdeveloper.com",
  phone: "+971585716695",
  address: "Zenith A2 Tower, Dubai Sports City, UAE"
} as const;

function getDefaultContactValue(key: string, displayName?: string) {
  const keyLower = key.toLowerCase();
  const labelLower = (displayName ?? "").toLowerCase();
  const probe = `${keyLower} ${labelLower}`;

  if (probe.includes("email")) return DEMO_CONTACT_DEFAULTS.email;
  if (probe.includes("phone") || probe.includes("mobile") || probe.includes("telephone")) {
    return DEMO_CONTACT_DEFAULTS.phone;
  }
  if (probe.includes("address") || probe.includes("location")) return DEMO_CONTACT_DEFAULTS.address;
  return "";
}

export default function NewApplicationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portalView = searchParams.get("portal") === "admin" ? "admin" : "vendor";

  const [step, setStep] = useState(1);
  const [applicationId, setApplicationId] = useState<string>("");
  const [vendorName, setVendorName] = useState("");
  const [notes, setNotes] = useState("");
  const [schema, setSchema] = useState<Record<string, WorkflowVariable>>({});
  const [contactInfo, setContactInfo] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadedKeys, setUploadedKeys] = useState<string[]>([]);

  useEffect(() => {
    setSchemaLoading(true);
    fetch("/api/workflow/schema")
      .then((res) => res.json())
      .then((data: WorkflowResponse) => setSchema(data.jobPayloadSchema ?? {}))
      .catch(() => setError("Failed to load workflow schema."))
      .finally(() => setSchemaLoading(false));
  }, []);

  const inputEntries = useMemo(
    () => Object.entries(schema).map(([key, variable]) => ({ key, variable })),
    [schema]
  );

  const requiredFileKeys = useMemo(
    () => inputEntries.filter((entry) => entry.variable.type === "file").map((entry) => entry.key),
    [inputEntries]
  );

  const contactFieldSchema = useMemo<Record<string, WorkflowVariable>>(() => {
    const contactEntry = inputEntries.find((entry) => entry.variable.type === "object");
    if (!contactEntry) return {};

    const fields = contactEntry.variable.type_definition;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return {};
    }

    return fields as Record<string, WorkflowVariable>;
  }, [inputEntries]);

  const requiredContactKeys = useMemo(
    () => Object.entries(contactFieldSchema).filter(([, field]) => !field.is_nullable).map(([fieldKey]) => fieldKey),
    [contactFieldSchema]
  );

  const requiredContactLabels = useMemo(
    () =>
      requiredContactKeys
        .filter((key) => !contactInfo[key] || !contactInfo[key].trim())
        .map((key) => contactFieldSchema[key]?.display_name ?? key),
    [contactFieldSchema, contactInfo, requiredContactKeys]
  );

  useEffect(() => {
    if (Object.keys(contactFieldSchema).length === 0) return;

    setContactInfo((previous) => {
      const next = { ...previous };

      for (const [fieldKey, field] of Object.entries(contactFieldSchema)) {
        if (typeof next[fieldKey] === "string" && next[fieldKey].trim().length > 0) {
          continue;
        }
        const defaultValue = getDefaultContactValue(fieldKey, field.display_name);
        if (defaultValue) {
          next[fieldKey] = defaultValue;
        }
      }

      return next;
    });
  }, [contactFieldSchema]);

  async function createDraft() {
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_name: vendorName, notes })
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error?.message || "Failed to create draft application.");
      setSubmitting(false);
      return;
    }

    setApplicationId(data.application.id);
    setStep(2);
    setSubmitting(false);
  }

  async function saveStepTwo() {
    if (!applicationId) return;

    const missingFiles = requiredFileKeys.filter((key) => !files[key]);
    if (missingFiles.length > 0) {
      setError(`Upload all required files before continuing: ${missingFiles.join(", ")}`);
      return;
    }

    if (requiredContactLabels.length > 0) {
      setError(`Complete UAE contact information before continuing: ${requiredContactLabels.join(", ")}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setUploadedKeys([]);
    setUploadingKey(null);

    for (const [inputKey, file] of Object.entries(files)) {
      if (!file) continue;
      setUploadingKey(inputKey);
      const formData = new FormData();
      formData.append("inputKey", inputKey);
      formData.append("file", file);

      const uploadResponse = await fetch(`/api/applications/${applicationId}/documents`, {
        method: "POST",
        body: formData
      });

      if (!uploadResponse.ok) {
        const payload = await uploadResponse.json();
        setError(payload.error ?? `Failed to upload ${inputKey}`);
        setSubmitting(false);
        setUploadingKey(null);
        return;
      }
      setUploadedKeys((previous) => [...previous, inputKey]);
    }
    setUploadingKey("contact_details");

    const patchResponse = await fetch(`/api/applications/${applicationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_json: contactInfo
      })
    });

    if (!patchResponse.ok) {
      const payload = await patchResponse.json();
      setError(payload.error ?? "Failed to save contact information.");
      setSubmitting(false);
      setUploadingKey(null);
      return;
    }

    setUploadingKey(null);
    setStep(3);
    setSubmitting(false);
  }

  async function submitApplication() {
    if (!applicationId) return;

    setSubmitting(true);
    const response = await fetch(`/api/applications/${applicationId}/submit`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "Failed to submit application.");
      setSubmitting(false);
      return;
    }

    router.push(`/applications/${applicationId}?view=${portalView}`);
  }

  return (
    <div className="space-y-6">
      <div className="hero-panel panel-hover p-6">
        <p className="section-title">{APP_BRAND.shortName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create and Send Application</h1>
        <p className="text-sm text-muted-foreground">
          This lane is only for collecting files and sending the application. After submit, continue in the Review lane.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((item) => {
          const state = step === item.id ? "active" : step > item.id ? "done" : "todo";
          return (
            <div
              key={item.id}
              className={`rounded-lg border p-3 transition ${
                state === "active"
                  ? "border-primary/50 bg-blue-50/70"
                  : state === "done"
                    ? "border-emerald-400/60 bg-emerald-50/85"
                    : "bg-white/82"
              }`}
            >
              <p className="text-xs font-semibold text-muted-foreground">Step {item.id}</p>
              <p className="text-sm font-medium">{item.title}</p>
            </div>
          );
        })}
      </div>

      <Card className="border border-border/70 bg-white/92 shadow-[0_12px_24px_-22px_rgba(14,44,79,0.35)]">
        <CardHeader>
          <CardTitle>
            {step === 1 ? "Vendor Basics" : null}
            {step === 2 ? "Compliance Inputs" : null}
            {step === 3 ? "Final Review & Send" : null}
          </CardTitle>
          <CardDescription>
            {step === 1 ? "Create draft and identify the vendor." : null}
            {step === 2 ? "Upload required files and add UAE contact details." : null}
            {step === 3 ? "Send to Review lane (status becomes submitted)." : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vendor_name">Vendor Name</Label>
                <Input
                  id="vendor_name"
                  value={vendorName}
                  onChange={(event) => setVendorName(event.target.value)}
                  placeholder="Zenith Developer LLC"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
              <Button onClick={createDraft} disabled={!vendorName || submitting}>
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating draft...
                  </span>
                ) : (
                  "Continue to Files"
                )}
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              {requiredFileKeys.length > 0 ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">Upload progress</p>
                    <p>
                      {uploadedKeys.length}/{requiredFileKeys.length} files uploaded
                    </p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round((uploadedKeys.length / requiredFileKeys.length) * 100)}%` }}
                    />
                  </div>
                  {submitting && uploadingKey ? (
                    <p className="mt-2 inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Processing: {uploadingKey}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {schemaLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : null}

              {!schemaLoading
                ? inputEntries.map(({ key, variable }) => {
                    if (!variable) return null;

                    if (variable.type === "file") {
                      const isUploading = uploadingKey === key;
                      const isUploaded = uploadedKeys.includes(key);
                      return (
                        <div key={key} className="space-y-2 rounded-lg border bg-white p-4">
                          <div className="flex items-center justify-between gap-2">
                            <Label>{variable.display_name ?? key}</Label>
                            {isUploading ? (
                              <span className="inline-flex items-center gap-1 text-xs text-primary">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Uploading
                              </span>
                            ) : null}
                            {isUploaded ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Uploaded
                              </span>
                            ) : null}
                          </div>
                          <Input
                            type="file"
                            disabled={submitting}
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              setFiles((prev) => ({ ...prev, [key]: file }));
                            }}
                          />
                          <p className="text-xs text-muted-foreground">{variable.display_description ?? variable.description}</p>
                          {files[key] ? <p className="text-xs text-primary">Selected: {files[key]?.name}</p> : null}
                        </div>
                      );
                    }

                    if (variable.type === "object") {
                      const fields = (variable.type_definition ?? {}) as Record<string, WorkflowVariable>;
                      return (
                        <div key={key} className="space-y-3 rounded-lg border bg-white p-4">
                          <h3 className="text-sm font-medium">{variable.display_name ?? key}</h3>
                          {Object.entries(fields).map(([fieldKey, field]) => (
                            <div key={fieldKey} className="space-y-1">
                              <Label>{field.display_name ?? fieldKey}</Label>
                              <Input
                                value={contactInfo[fieldKey] ?? ""}
                                onChange={(event) =>
                                  setContactInfo((prev) => ({
                                    ...prev,
                                    [fieldKey]: event.target.value
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      );
                    }

                    return null;
                  })
                : null}

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                  Back
                </Button>
                <Button onClick={saveStepTwo} disabled={submitting}>
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving files...
                    </span>
                  ) : (
                    "Continue to Submit"
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-white p-4 text-sm">
                <p>
                  <span className="font-medium">Vendor:</span> {vendorName}
                </p>
                <p>
                  <span className="font-medium">Notes:</span> {notes || "-"}
                </p>
              </div>

              <div className="rounded-lg border bg-white p-4 text-sm">
                <p className="font-medium">UAE Contact</p>
                <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                  {JSON.stringify(contactInfo, null, 2)}
                </pre>
              </div>

              <p className="text-sm text-muted-foreground">
                Submitting now will mark this application as <span className="font-medium text-foreground">submitted</span> and unlock
                the Review lane on the detail page.
              </p>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button onClick={submitApplication} disabled={submitting}>
                  {submitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit Application"
                  )}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
