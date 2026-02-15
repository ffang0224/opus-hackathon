const PASS_LIKE = ["valid", "compliant", "approved", "pass", "authentic"];

export type WorkItem = {
  path: string;
  status: string;
  action: string;
};

function keyLooksLikeStatus(key: string) {
  const lower = key.toLowerCase();
  return lower.includes("status") || lower.includes("validation") || lower.includes("compliance");
}

function valuePasses(raw: string) {
  const normalized = raw.toLowerCase();
  return PASS_LIKE.some((item) => normalized.includes(item));
}

function walk(value: unknown, path: string[] = [], out: WorkItem[] = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, [...path, String(index)], out));
    return out;
  }

  if (value && typeof value === "object") {
    for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = [...path, key];
      if (keyLooksLikeStatus(key)) {
        const status = typeof next === "string" ? next.trim() : JSON.stringify(next ?? "");
        if (!status || !valuePasses(status)) {
          out.push({
            path: nextPath.join("."),
            status: status || "needs review",
            action: "Update and re-submit supporting documents or contact details."
          });
        }
      }
      walk(next, nextPath, out);
    }
  }

  return out;
}

export function extractWorkItems(resultJson: Record<string, unknown> | null | undefined): WorkItem[] {
  if (!resultJson) {
    return [];
  }

  const items = walk(resultJson, [], []);
  if (items.length === 0) {
    return [
      {
        path: "overall",
        status: "needs review",
        action: "No explicit pass/fail statuses detected; perform manual compliance review."
      }
    ];
  }

  return items;
}

export function buildVendorNotification(items: WorkItem[]) {
  const lines = items.slice(0, 6).map((item, idx) => `${idx + 1}. ${item.path}: ${item.status}`);
  return `Please address the following compliance items:\n${lines.join("\n")}`;
}

export function buildAdminNotification(items: WorkItem[]) {
  return `Compliance review generated ${items.length} follow-up item(s).`;
}
