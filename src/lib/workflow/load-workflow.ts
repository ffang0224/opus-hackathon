import { promises as fs } from "fs";
import path from "path";

import type { WorkflowSchema, WorkflowVariable } from "@/lib/workflow/types";

const workflowCandidates = [
  path.join(process.cwd(), "documentation", "workflow.json"),
  path.join(process.cwd(), "documentation", "agents", "workflow.json")
];

function sanitizeSchema(input: unknown): WorkflowSchema {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid workflow schema file");
  }

  const raw = input as Record<string, unknown>;
  const payloadSchema = (raw.jobPayloadSchema ?? {}) as Record<string, WorkflowVariable>;
  const resultsSchema = (raw.jobResultsPayloadSchema ?? {}) as Record<string, WorkflowVariable>;

  return {
    workflowId: typeof raw.workflowId === "string" ? raw.workflowId : undefined,
    name: typeof raw.name === "string" ? raw.name : undefined,
    jobPayloadSchema: payloadSchema,
    jobResultsPayloadSchema: resultsSchema
  };
}

export async function loadWorkflowSchema(): Promise<WorkflowSchema> {
  for (const candidate of workflowCandidates) {
    try {
      const file = await fs.readFile(candidate, "utf8");
      return sanitizeSchema(JSON.parse(file));
    } catch {
      // Try next candidate path.
    }
  }

  throw new Error(
    "Workflow schema not found. Expected documentation/workflow.json or documentation/agents/workflow.json"
  );
}
