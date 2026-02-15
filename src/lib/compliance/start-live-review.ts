import { env } from "@/lib/env";
import { getOpusDocsConfig } from "@/lib/opus/docs-config";
import { opusRequest, uploadToPresignedUrl } from "@/lib/opus/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkflowSchema } from "@/lib/workflow/load-workflow";

type ApplicationDocument = {
  id: string;
  input_key: string;
  storage_path: string;
  filename: string;
  mime_type: string;
};

export class ComplianceRunError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function extensionFromFilename(filename: string) {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index) : ".pdf";
}

async function getDocumentBytes(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  storagePath: string
) {
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    const response = await fetch(storagePath);
    if (!response.ok) {
      throw new ComplianceRunError(`Failed to download external sample file (${response.status})`);
    }
    return await response.arrayBuffer();
  }

  const { data: fileData, error: downloadError } = await supabase.storage.from("vendor-docs").download(storagePath);

  if (downloadError || !fileData) {
    throw new ComplianceRunError("Failed to download file from storage");
  }

  return await fileData.arrayBuffer();
}

export async function getLatestJobExecutionId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  applicationId: string
) {
  const { data } = await supabase
    .from("audit_log")
    .select("meta,created_at")
    .eq("application_id", applicationId)
    .eq("action", "opus_job_started")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.meta || typeof data.meta !== "object") return null;
  const candidate = (data.meta as Record<string, unknown>).jobExecutionId;
  return typeof candidate === "string" ? candidate : null;
}

export async function startLiveComplianceReview(params: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  applicationId: string;
}) {
  const opusConfig = await getOpusDocsConfig();
  if (!opusConfig.enabled || !opusConfig.endpoints) {
    throw new ComplianceRunError("Compliance backend integration requires docs configuration.");
  }

  const [workflow, appResponse, docsResponse] = await Promise.all([
    loadWorkflowSchema(),
    params.supabase
      .from("applications")
      .select("id,vendor_name,status,contact_json")
      .eq("id", params.applicationId)
      .eq("created_by", params.userId)
      .single(),
    params.supabase
      .from("application_documents")
      .select("id,input_key,storage_path,filename,mime_type")
      .eq("application_id", params.applicationId)
      .order("created_at", { ascending: false })
  ]);

  if (appResponse.error || !appResponse.data) {
    throw new ComplianceRunError("Application not found", 404);
  }

  if (appResponse.data.status === "draft") {
    throw new ComplianceRunError("Submit application before starting backend review.");
  }

  const workflowId = env.opusWorkflowId || workflow.workflowId;
  if (!workflowId) {
    throw new ComplianceRunError("Compliance backend integration requires docs configuration.");
  }

  await opusRequest<Record<string, unknown>>(
    opusConfig,
    opusConfig.endpoints.workflowDetails.replace("{workflowId}", workflowId),
    { method: "GET" }
  );

  const initiated = await opusRequest<{ jobExecutionId: string }>(opusConfig, opusConfig.endpoints.initiateJob, {
    method: "POST",
    body: JSON.stringify({
      workflowId,
      title: `${appResponse.data.vendor_name} Compliance Review`,
      description: "Vendor compliance validation run"
    })
  });

  const jobExecutionId = initiated.jobExecutionId;
  const payload: Record<string, { value: unknown; type: string; displayName: string }> = {};
  const docsByKey = new Map<string, ApplicationDocument>();

  for (const doc of docsResponse.data ?? []) {
    if (!docsByKey.has(doc.input_key)) {
      docsByKey.set(doc.input_key, doc);
    }
  }

  for (const [key, variable] of Object.entries(workflow.jobPayloadSchema)) {
    if (!variable) continue;

    if (variable.type === "file") {
      const document = docsByKey.get(key);
      if (!document) {
        if (variable.is_nullable) continue;
        throw new ComplianceRunError(`Missing uploaded document for ${variable.display_name ?? key}`);
      }

      const uploadTarget = await opusRequest<{ presignedUrl: string; fileUrl: string }>(
        opusConfig,
        opusConfig.endpoints.getUploadUrl,
        {
          method: "POST",
          body: JSON.stringify({
            fileExtension: extensionFromFilename(document.filename),
            accessScope: "workspace"
          })
        }
      );

      const bytes = await getDocumentBytes(params.supabase, document.storage_path);
      await uploadToPresignedUrl(uploadTarget.presignedUrl, bytes, document.mime_type || "application/octet-stream");

      payload[key] = {
        value: uploadTarget.fileUrl,
        type: "file",
        displayName: variable.display_name ?? key
      };
      continue;
    }

    if (variable.type === "object") {
      const contactValue = appResponse.data.contact_json ?? {};
      if (!variable.is_nullable && (!contactValue || Object.keys(contactValue).length === 0)) {
        throw new ComplianceRunError(`Missing required input for ${variable.display_name ?? key}`);
      }

      payload[key] = {
        value: contactValue,
        type: "object",
        displayName: variable.display_name ?? key
      };
      continue;
    }

    if (typeof variable.value === "undefined" || variable.value === null) {
      if (variable.is_nullable) continue;
      throw new ComplianceRunError(`Missing required input for ${variable.display_name ?? key}`);
    }

    payload[key] = {
      value: variable.value,
      type: variable.type,
      displayName: variable.display_name ?? key
    };
  }

  await opusRequest(opusConfig, opusConfig.endpoints.executeJob, {
    method: "POST",
    body: JSON.stringify({
      jobExecutionId,
      jobPayloadSchemaInstance: payload
    })
  });

  await params.supabase.from("audit_log").insert({
    application_id: params.applicationId,
    actor_user_id: params.userId,
    action: "opus_job_started",
    meta: { jobExecutionId }
  });

  return { jobExecutionId };
}
