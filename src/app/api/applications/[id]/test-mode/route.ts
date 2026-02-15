import { NextResponse } from "next/server";

import {
  buildAdminNotification,
  buildVendorNotification,
  extractWorkItems
} from "@/lib/compliance/extract-work-items";
import { requireRouteUser } from "@/lib/supabase/require-user";
import { loadWorkflowSchema } from "@/lib/workflow/load-workflow";
import { extractDemoInputSamples, extractDemoResultJson } from "@/lib/workflow/samples";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const { data: existingApp, error: appFetchError } = await context.supabase
    .from("applications")
    .select("id,vendor_name")
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .single();

  if (appFetchError || !existingApp) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const workflow = await loadWorkflowSchema();
  const inputSamples = extractDemoInputSamples(workflow);
  const resultSample = extractDemoResultJson(workflow);

  const { data: updatedApplication, error: updateError } = await context.supabase
    .from("applications")
    .update({
      contact_json: inputSamples.contactJson,
      result_json: resultSample,
      status: "reviewed"
    })
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .select("id,vendor_name,status,contact_json,result_json,updated_at")
    .single();

  if (updateError || !updatedApplication) {
    return NextResponse.json({ error: updateError?.message ?? "Failed to apply test mode" }, { status: 400 });
  }

  const fileInputKeys = inputSamples.documents.map((document) => document.inputKey);
  if (fileInputKeys.length > 0) {
    await context.supabase
      .from("application_documents")
      .delete()
      .eq("application_id", params.id)
      .in("input_key", fileInputKeys);

    await context.supabase.from("application_documents").insert(
      inputSamples.documents.map((document) => ({
        application_id: params.id,
        input_key: document.inputKey,
        storage_path: document.url,
        filename: document.filename,
        mime_type: document.mimeType,
        size: 0
      }))
    );
  }

  const workItems = extractWorkItems(resultSample);
  const vendorMessage = buildVendorNotification(workItems);
  const adminMessage = buildAdminNotification(workItems);

  const recipientEmailValue = inputSamples.contactJson.email;
  const recipientEmail = typeof recipientEmailValue === "string" ? recipientEmailValue : null;

  await context.supabase.from("notifications").insert([
    {
      application_id: params.id,
      created_by: context.user.id,
      category: "vendor",
      recipient_email: recipientEmail,
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
    action: "test_mode_applied",
    meta: {
      source: "workflow_samples",
      document_count: inputSamples.documents.length,
      result_keys: Object.keys(resultSample)
    }
  });

  return NextResponse.json({
    application: updatedApplication,
    demoDocuments: inputSamples.documents,
    workItems
  });
}
