import { NextResponse } from "next/server";

import { getOpusDocsConfig } from "@/lib/opus/docs-config";
import { loadWorkflowSchema } from "@/lib/workflow/load-workflow";

export async function GET() {
  try {
    const [schema, opus] = await Promise.all([loadWorkflowSchema(), getOpusDocsConfig()]);

    return NextResponse.json({
      workflowId: schema.workflowId,
      name: schema.name,
      jobPayloadSchema: schema.jobPayloadSchema,
      jobResultsPayloadSchema: schema.jobResultsPayloadSchema,
      opus
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load workflow schema" },
      { status: 500 }
    );
  }
}
