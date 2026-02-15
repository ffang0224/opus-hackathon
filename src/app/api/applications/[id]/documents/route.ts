import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireRouteUser } from "@/lib/supabase/require-user";
import { buildVendorDocPath, sanitizeFilename } from "@/lib/supabase/storage";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const formData = await request.formData();
  const inputKey = String(formData.get("inputKey") ?? "");
  const file = formData.get("file");

  if (!inputKey || !(file instanceof File)) {
    return NextResponse.json({ error: "inputKey and file are required" }, { status: 400 });
  }

  const { data: application, error: applicationError } = await context.supabase
    .from("applications")
    .select("id")
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .single();

  if (applicationError || !application) {
    return NextResponse.json({ error: "Application not found or not owned by current user." }, { status: 404 });
  }

  let documentWriteClient = context.supabase;
  try {
    documentWriteClient = createSupabaseAdminClient();
  } catch {
    // Fallback to user-scoped client when service key is unavailable.
  }

  const filename = sanitizeFilename(file.name);
  const storagePath = buildVendorDocPath(context.user.id, params.id, inputKey, filename);
  const fileBuffer = await file.arrayBuffer();
  const { data: existingRows, error: existingRowsError } = await documentWriteClient
    .from("application_documents")
    .select("id,storage_path")
    .eq("application_id", params.id)
    .eq("input_key", inputKey);

  if (existingRowsError) {
    return NextResponse.json({ error: existingRowsError.message }, { status: 400 });
  }

  const { error: uploadError } = await context.supabase.storage.from("vendor-docs").upload(storagePath, fileBuffer, {
    contentType: file.type,
    upsert: true
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  if ((existingRows ?? []).length > 0) {
    const { error: deleteRowsError } = await documentWriteClient
      .from("application_documents")
      .delete()
      .eq("application_id", params.id)
      .eq("input_key", inputKey);

    if (deleteRowsError) {
      return NextResponse.json({ error: deleteRowsError.message }, { status: 400 });
    }
  }

  const { data: doc, error: dbError } = await documentWriteClient
    .from("application_documents")
    .insert({
      application_id: params.id,
      input_key: inputKey,
      storage_path: storagePath,
      filename,
      mime_type: file.type,
      size: file.size
    })
    .select("id,input_key,filename,size,mime_type,storage_path,created_at")
    .single();

  if (dbError || !doc) {
    if (dbError?.message?.toLowerCase().includes("row-level security")) {
      return NextResponse.json(
        { error: "Upload blocked by access rules. Please re-open the application and try again." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: dbError?.message ?? "Failed to record document" }, { status: 400 });
  }

  const previousPaths = (existingRows ?? [])
    .map((row) => row.storage_path)
    .filter((path) => path !== storagePath && !path.startsWith("http://") && !path.startsWith("https://"));
  if (previousPaths.length > 0) {
    await context.supabase.storage.from("vendor-docs").remove(previousPaths);
  }

  await context.supabase.from("audit_log").insert({
    application_id: params.id,
    actor_user_id: context.user.id,
    action: "document_uploaded",
    meta: { input_key: inputKey, filename }
  });

  return NextResponse.json({ document: doc });
}
