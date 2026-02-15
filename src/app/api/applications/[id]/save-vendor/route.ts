import { NextResponse } from "next/server";

import { requireRouteUser } from "@/lib/supabase/require-user";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const { data: application, error: appError } = await context.supabase
    .from("applications")
    .select("id,vendor_name,contact_json,result_json")
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data: vendor, error: vendorError } = await context.supabase
    .from("vendors")
    .upsert(
      {
        name: application.vendor_name,
        contact_json: application.contact_json ?? {},
        latest_compliance_json: application.result_json ?? {},
        created_by: context.user.id,
        updated_by: context.user.id
      },
      { onConflict: "name,created_by" }
    )
    .select("id,name,contact_json,latest_compliance_json,updated_at")
    .single();

  if (vendorError || !vendor) {
    return NextResponse.json({ error: vendorError?.message ?? "Failed to save vendor" }, { status: 400 });
  }

  await context.supabase.from("audit_log").insert({
    application_id: params.id,
    actor_user_id: context.user.id,
    action: "vendor_saved",
    meta: { vendor_id: vendor.id }
  });

  return NextResponse.json({ vendor });
}
