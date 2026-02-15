import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteUser } from "@/lib/supabase/require-user";

const patchSchema = z.object({
  status: z.enum(["draft", "submitted", "reviewed", "approved", "rejected"]).optional(),
  reviewer_comment: z.string().nullable().optional(),
  contact_json: z.record(z.string(), z.unknown()).optional(),
  result_json: z.record(z.string(), z.unknown()).nullable().optional()
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const { data: application, error } = await context.supabase
    .from("applications")
    .select("id,created_by,vendor_name,status,contact_json,result_json,reviewer_comment,created_at,updated_at")
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .single();

  if (error || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const [{ data: docs }, { data: notifications }, { data: auditEntries }] = await Promise.all([
    context.supabase
      .from("application_documents")
      .select("id,input_key,storage_path,filename,mime_type,size,created_at")
      .eq("application_id", params.id)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("notifications")
      .select("id,category,recipient_email,message,is_read,created_at")
      .eq("application_id", params.id)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("audit_log")
      .select("id,action,meta,created_at")
      .eq("application_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  const latestDocs = (docs ?? []).filter((doc, index, list) => list.findIndex((entry) => entry.input_key === doc.input_key) === index);

  const withSignedUrls = await Promise.all(
    latestDocs.map(async (doc) => {
      if (doc.storage_path.startsWith("http://") || doc.storage_path.startsWith("https://")) {
        return {
          ...doc,
          signed_url: doc.storage_path
        };
      }

      const { data: signed } = await context.supabase.storage.from("vendor-docs").createSignedUrl(doc.storage_path, 3600);
      return {
        ...doc,
        signed_url: signed?.signedUrl ?? null
      };
    })
  );

  const latestJobStarted = (auditEntries ?? []).find((entry) => {
    if (entry.action !== "opus_job_started") return false;
    if (!entry.meta || typeof entry.meta !== "object") return false;
    return typeof (entry.meta as Record<string, unknown>).jobExecutionId === "string";
  });
  const latestJobExecutionId =
    latestJobStarted && latestJobStarted.meta && typeof latestJobStarted.meta === "object"
      ? ((latestJobStarted.meta as Record<string, unknown>).jobExecutionId as string)
      : null;

  return NextResponse.json({
    application,
    documents: withSignedUrls,
    notifications: notifications ?? [],
    audit: auditEntries ?? [],
    latestJobExecutionId
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: updated, error } = await context.supabase
    .from("applications")
    .update(parsed.data)
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .select("id,vendor_name,status,contact_json,result_json,reviewer_comment,created_at,updated_at")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Failed to update application" }, { status: 400 });
  }

  await context.supabase.from("audit_log").insert({
    application_id: params.id,
    actor_user_id: context.user.id,
    action: "application_updated",
    meta: parsed.data
  });

  return NextResponse.json({ application: updated });
}
