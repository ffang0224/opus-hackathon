import { promises as fs } from "fs";
import path from "path";

import { env } from "@/lib/env";
import type { OpusConfig } from "@/lib/workflow/types";

const docsPath = path.join(process.cwd(), "documentation", "agents", "opus-job-operator-api.md");
const MISSING_MESSAGE = "Compliance backend integration requires docs configuration.";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractEndpoint(markdown: string, sectionTitle: string, method: "GET" | "POST") {
  const regex = new RegExp(
    "###\\s+\\d+\\)\\s*" +
      escapeRegex(sectionTitle) +
      "[\\s\\S]*?-\\s*Method\\/Path:\\s*`" +
      method +
      "\\s+([^`]+)`",
    "i"
  );
  return markdown.match(regex)?.[1]?.trim();
}

function hasRequiredBaseSetup(markdown: string) {
  return markdown.includes("Base URL:") && markdown.includes("x-service-key");
}

export async function getOpusDocsConfig(): Promise<OpusConfig> {
  let markdown = "";
  try {
    markdown = await fs.readFile(docsPath, "utf8");
  } catch {
    return { enabled: false, mode: "manual", reason: MISSING_MESSAGE };
  }

  const baseUrlMatch = markdown.match(/Base URL:\s*`([^`]+)`/i);
  const authHeaderMatch = markdown.match(/Auth header[^`]*`([^`]+)`/i);
  const workflowDetails = extractEndpoint(markdown, "Get Workflow Details", "GET");
  const initiateJob = extractEndpoint(markdown, "Initiate Job", "POST");
  const getUploadUrl = extractEndpoint(markdown, "Get Upload URL", "POST");
  const executeJob = extractEndpoint(markdown, "Execute Job", "POST");
  const status = extractEndpoint(markdown, "Get Job Execution Status", "GET");
  const results = extractEndpoint(markdown, "Get Job Execution Results", "GET");
  const audit = extractEndpoint(markdown, "Job Audit Log", "GET");

  const config: OpusConfig = {
    enabled: false,
    mode: "manual",
    reason: MISSING_MESSAGE,
    baseUrl: env.opusBaseUrl || baseUrlMatch?.[1],
    authHeaderName: authHeaderMatch?.[1]?.split(":")[0]?.trim() || "x-service-key",
    endpoints:
      workflowDetails && initiateJob && getUploadUrl && executeJob && status && results && audit
        ? {
            workflowDetails,
            initiateJob,
            getUploadUrl,
            executeJob,
            status,
            results,
            audit
          }
        : undefined
  };

  if (!config.baseUrl || !config.authHeaderName || !config.endpoints || !hasRequiredBaseSetup(markdown) || !env.opusServiceKey) {
    return { ...config, enabled: false, mode: "manual", reason: MISSING_MESSAGE };
  }

  return { ...config, enabled: true, mode: "live" };
}
