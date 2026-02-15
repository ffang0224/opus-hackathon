import { NextResponse } from "next/server";

import { ComplianceRunError, startLiveComplianceReview } from "@/lib/compliance/start-live-review";
import { requireRouteUser } from "@/lib/supabase/require-user";

function humanizeUnknownError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Automatic compliance start failed. You can still review manually.";
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const { data: application, error } = await context.supabase
    .from("applications")
    .update({ status: "submitted" })
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .select("id,vendor_name,status,updated_at")
    .single();

  if (error || !application) {
    return NextResponse.json({ error: error?.message ?? "Failed to submit application" }, { status: 400 });
  }

  await context.supabase.from("audit_log").insert({
    application_id: params.id,
    actor_user_id: context.user.id,
    action: "application_submitted",
    meta: {}
  });

  try {
    const started = await startLiveComplianceReview({
      supabase: context.supabase,
      userId: context.user.id,
      applicationId: params.id
    });
    return NextResponse.json({
      application,
      review: {
        started: true,
        jobExecutionId: started.jobExecutionId
      }
    });
  } catch (error) {
    if (error instanceof ComplianceRunError) {
      return NextResponse.json({
        application,
        review: {
          started: false,
          reason: error.message
        }
      });
    }

    const message = humanizeUnknownError(error);
    await context.supabase.from("audit_log").insert({
      application_id: params.id,
      actor_user_id: context.user.id,
      action: "opus_job_start_failed",
      meta: { error: message }
    });

    return NextResponse.json({
      application,
      review: {
        started: false,
        reason: message
      }
    });
  }
}
