import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildAdminNotification,
  buildVendorNotification,
  extractWorkItems
} from "@/lib/compliance/extract-work-items";
import { getLatestJobExecutionId } from "@/lib/compliance/start-live-review";
import { getOpusDocsConfig } from "@/lib/opus/docs-config";
import { opusRequest } from "@/lib/opus/client";
import { requireRouteUser } from "@/lib/supabase/require-user";
import { normalizeResultsPayload } from "@/lib/workflow/normalize-results";

const bodySchema = z.object({
  jobExecutionId: z.string().optional(),
  manualResultJson: z.record(z.string(), z.unknown()).optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: application, error: appError } = await context.supabase
    .from("applications")
    .select("id,created_by,contact_json")
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: applicationStage } = await context.supabase
    .from("applications")
    .select("status")
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .single();

  if (applicationStage?.status === "draft") {
    return NextResponse.json(
      { error: "This application is in Submit stage. Submit it first, then save review results." },
      { status: 400 }
    );
  }

  let resultJson: Record<string, unknown>;
  let rawResponse: Record<string, unknown>;
  let resolvedJobExecutionId: string | null = null;

  if (parsed.data.manualResultJson) {
    resultJson = parsed.data.manualResultJson;
    rawResponse = parsed.data.manualResultJson;
  } else {
    resolvedJobExecutionId = parsed.data.jobExecutionId ?? (await getLatestJobExecutionId(context.supabase, params.id));
    if (!resolvedJobExecutionId) {
      return NextResponse.json({ error: "No review job has been started for this application yet." }, { status: 400 });
    }

    const opusConfig = await getOpusDocsConfig();
    if (!opusConfig.enabled || !opusConfig.endpoints) {
      return NextResponse.json({ error: "Compliance backend integration requires docs configuration." }, { status: 400 });
    }

    const opusResults = await opusRequest<Record<string, unknown>>(
      opusConfig,
      opusConfig.endpoints.results.replace("{jobExecutionId}", resolvedJobExecutionId),
      {
        method: "GET"
      }
    );
    rawResponse = opusResults;
    resultJson = normalizeResultsPayload(opusResults);
  }

  const { error: updateError } = await context.supabase
    .from("applications")
    .update({ result_json: resultJson, status: "reviewed" })
    .eq("id", params.id)
    .eq("created_by", context.user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const workItems = extractWorkItems(resultJson);
  const vendorMessage = buildVendorNotification(workItems);
  const adminMessage = buildAdminNotification(workItems);
  const recipientEmail =
    application.contact_json && typeof application.contact_json === "object"
      ? (application.contact_json as Record<string, unknown>).email
      : null;

  await context.supabase.from("notifications").insert([
    {
      application_id: params.id,
      created_by: context.user.id,
      category: "vendor",
      recipient_email: typeof recipientEmail === "string" ? recipientEmail : null,
      message: vendorMessage
    },
    {
      application_id: params.id,
      created_by: context.user.id,
      category: "admin",
      recipient_user_id: context.user.id,
      message: adminMessage
    }
  ]);

  await context.supabase.from("audit_log").insert({
    application_id: params.id,
    actor_user_id: context.user.id,
    action: parsed.data.manualResultJson ? "manual_result_saved" : "opus_result_saved",
    meta: {
      source: parsed.data.manualResultJson ? "manual" : "opus",
      work_item_count: workItems.length,
      jobExecutionId: parsed.data.manualResultJson ? null : resolvedJobExecutionId
    }
  });

  return NextResponse.json({ result_json: resultJson, raw_response: rawResponse, workItems });
}
