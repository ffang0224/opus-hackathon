function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapResultsPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(payload.results)) {
    const results = payload.results;
    if (isRecord(results.data)) {
      const data = results.data;
      if (isRecord(data.jobResultsPayloadSchema)) {
        return data.jobResultsPayloadSchema;
      }
      return data;
    }
    if (isRecord(results.jobResultsPayloadSchema)) {
      return results.jobResultsPayloadSchema;
    }
    return results;
  }

  if (isRecord(payload.jobResultsPayloadSchema)) {
    return payload.jobResultsPayloadSchema;
  }

  if (isRecord(payload.data)) {
    return payload.data;
  }

  return payload;
}

function hasTypedValueEnvelope(value: unknown): value is { value: unknown; type: string } {
  return isRecord(value) && "value" in value && typeof value.type === "string";
}

function normalizeValueMap(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  let foundEnvelope = false;

  for (const [key, value] of Object.entries(payload)) {
    if (hasTypedValueEnvelope(value)) {
      normalized[key] = value.value;
      foundEnvelope = true;
      continue;
    }
    normalized[key] = value;
  }

  return foundEnvelope ? normalized : payload;
}

export function normalizeResultsPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {};
  }

  const unwrapped = unwrapResultsPayload(payload);
  return normalizeValueMap(unwrapped);
}
