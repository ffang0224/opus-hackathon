import type { WorkflowVariable } from "@/lib/workflow/types";
import { normalizeResultsPayload } from "@/lib/workflow/normalize-results";

export type RenderedResultNode = {
  key: string;
  label: string;
  value: string;
  tone: "pass" | "issue" | "neutral";
};

function prettyLabel(label: string) {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function classifyValue(key: string, value: unknown): "pass" | "issue" | "neutral" {
  const label = key.toLowerCase();
  const text = typeof value === "string" ? value.toLowerCase().trim() : "";
  const passValues = new Set(["valid", "compliant", "approved", "pass", "authentic", "approval"]);
  const issueHints = ["mismatch", "flagged", "invalid", "reject", "error", "failed", "disapprove", "review"];

  if ((label.includes("status") || label.includes("validation")) && text) {
    if (passValues.has(text)) return "pass";
    if (issueHints.some((hint) => text.includes(hint))) return "issue";
    return "neutral";
  }

  if (label.includes("reason") && text.length > 0) {
    return "issue";
  }

  return "neutral";
}

export function flattenResults(
  schema: Record<string, WorkflowVariable>,
  resultJson: Record<string, unknown> | null | undefined
): RenderedResultNode[] {
  if (!resultJson) {
    return [];
  }

  const normalized = normalizeResultsPayload(resultJson);
  const entries: RenderedResultNode[] = Object.entries(schema).map(([key, variable]) => {
    const value = normalized[key];
    return {
      key,
      label: variable.display_name ?? prettyLabel(key),
      value: normalizeValue(value),
      tone: classifyValue(key, value)
    };
  });

  const schemaKeys = new Set(Object.keys(schema));
  for (const [key, value] of Object.entries(normalized)) {
    if (schemaKeys.has(key)) continue;
    entries.push({
      key,
      label: prettyLabel(key),
      value: normalizeValue(value),
      tone: classifyValue(key, value)
    });
  }

  return entries;
}
