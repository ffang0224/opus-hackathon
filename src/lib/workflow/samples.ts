import type { WorkflowSchema, WorkflowVariable } from "@/lib/workflow/types";

export type DemoDocumentSample = {
  inputKey: string;
  url: string;
  filename: string;
  mimeType: string;
};

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".csv": "text/csv",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".json": "application/json",
  ".html": "text/html",
  ".xml": "application/xml"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikeWorkflowVariable(value: unknown): value is WorkflowVariable {
  return isRecord(value) && typeof value.type === "string";
}

function sampleFromVariable(variable: WorkflowVariable): unknown {
  if (variable.value !== undefined && variable.value !== null) {
    if (variable.type === "array") {
      if (Array.isArray(variable.value) && variable.value.length > 0) {
        return variable.value;
      }
    } else if (variable.type === "object") {
      if (isRecord(variable.value) && Object.keys(variable.value).length > 0) {
        return variable.value;
      }
    } else {
      return variable.value;
    }
  }

  if (!variable.type_definition) {
    return variable.value ?? null;
  }

  if (variable.type === "array" && looksLikeWorkflowVariable(variable.type_definition)) {
    return [sampleFromVariable(variable.type_definition)];
  }

  if (variable.type === "object" && isRecord(variable.type_definition)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(variable.type_definition)) {
      if (looksLikeWorkflowVariable(nested)) {
        result[key] = sampleFromVariable(nested);
      }
    }
    return result;
  }

  return variable.value ?? null;
}

function filenameFromUrl(url: string, inputKey: string) {
  try {
    const pathPart = new URL(url).pathname.split("/").pop();
    return pathPart && pathPart.length > 0 ? pathPart : `${inputKey}.dat`;
  } catch {
    return `${inputKey}.dat`;
  }
}

function mimeFromFilename(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function extractDemoInputSamples(schema: WorkflowSchema): {
  contactJson: Record<string, unknown>;
  documents: DemoDocumentSample[];
} {
  const contactVariable = schema.jobPayloadSchema.uae_contact_information;
  const contactJson = isRecord(contactVariable?.value) ? contactVariable.value : {};

  const documents: DemoDocumentSample[] = Object.entries(schema.jobPayloadSchema)
    .filter(([, variable]) => variable.type === "file")
    .flatMap(([inputKey, variable]) => {
      if (typeof variable.value !== "string") {
        return [];
      }
      if (!variable.value.startsWith("http://") && !variable.value.startsWith("https://")) {
        return [];
      }
      const filename = filenameFromUrl(variable.value, inputKey);
      return [
        {
          inputKey,
          url: variable.value,
          filename,
          mimeType: mimeFromFilename(filename)
        }
      ];
    });

  return { contactJson, documents };
}

export function extractDemoResultJson(schema: WorkflowSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, variable] of Object.entries(schema.jobResultsPayloadSchema)) {
    out[key] = sampleFromVariable(variable);
  }

  return out;
}
