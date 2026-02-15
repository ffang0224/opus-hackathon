import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteUser } from "@/lib/supabase/require-user";

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewerComment: z.string().trim().min(1).optional()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const parsed = decisionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: application, error: appError } = await context.supabase
    .from("applications")
    .select("id,vendor_name,status,contact_json,result_json")
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (application.status === "draft") {
    return NextResponse.json(
      { error: "Application must be submitted before an admin decision can be made." },
      { status: 400 }
    );
  }

  const { decision, reviewerComment } = parsed.data;

  const { data: updatedApplication, error: updateError } = await context.supabase
    .from("applications")
    .update({
      status: decision,
      reviewer_comment: reviewerComment ?? null
    })
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .select("id,vendor_name,status,reviewer_comment,updated_at")
    .single();

  if (updateError || !updatedApplication) {
    return NextResponse.json({ error: updateError?.message ?? "Failed to update decision" }, { status: 400 });
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
    .select("id,name,updated_at")
    .single();

  if (vendorError || !vendor) {
    return NextResponse.json({ error: vendorError?.message ?? "Failed to add vendor" }, { status: 400 });
  }

  await context.supabase.from("audit_log").insert({
    application_id: params.id,
    actor_user_id: context.user.id,
    action: "application_decision",
    meta: {
      decision,
      reviewerComment: reviewerComment ?? null,
      vendor_id: vendor.id
    }
  });

  return NextResponse.json({
    application: updatedApplication,
    vendor
  });
}
