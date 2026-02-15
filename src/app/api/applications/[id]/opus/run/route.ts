import { NextResponse } from "next/server";

import { ComplianceRunError, startLiveComplianceReview } from "@/lib/compliance/start-live-review";
import { requireRouteUser } from "@/lib/supabase/require-user";

function parseStatusFromErrorMessage(message: string) {
  const match = message.match(/\((\d{3})\)/);
  if (!match) return 500;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : 500;
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  try {
    const started = await startLiveComplianceReview({
      supabase: context.supabase,
      userId: context.user.id,
      applicationId: params.id
    });
    return NextResponse.json(started);
  } catch (error) {
    if (error instanceof ComplianceRunError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Failed to start compliance review.";
    await context.supabase.from("audit_log").insert({
      application_id: params.id,
      actor_user_id: context.user.id,
      action: "opus_job_start_failed",
      meta: { error: message }
    });
    return NextResponse.json({ error: message }, { status: parseStatusFromErrorMessage(message) });
  }
}
