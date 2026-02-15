import { NextRequest, NextResponse } from "next/server";

import { getLatestJobExecutionId } from "@/lib/compliance/start-live-review";
import { getOpusDocsConfig } from "@/lib/opus/docs-config";
import { opusRequest } from "@/lib/opus/client";
import { requireRouteUser } from "@/lib/supabase/require-user";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const requestedJobExecutionId = request.nextUrl.searchParams.get("jobExecutionId");

  const { data } = await context.supabase
    .from("applications")
    .select("id")
    .eq("id", params.id)
    .eq("created_by", context.user.id)
    .single();

  if (!data) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const jobExecutionId = requestedJobExecutionId ?? (await getLatestJobExecutionId(context.supabase, params.id));
  if (!jobExecutionId) {
    return NextResponse.json({ error: "No review job has been started for this application yet." }, { status: 400 });
  }

  const opusConfig = await getOpusDocsConfig();
  if (!opusConfig.enabled || !opusConfig.endpoints) {
    return NextResponse.json({ error: "Compliance backend integration requires docs configuration." }, { status: 400 });
  }

  const auditResult = await opusRequest<Record<string, unknown>>(
    opusConfig,
    opusConfig.endpoints.audit.replace("{jobExecutionId}", jobExecutionId),
    {
      method: "GET"
    }
  );

  return NextResponse.json({ audit: auditResult, jobExecutionId });
}
