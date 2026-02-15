import { env } from "@/lib/env";
import type { OpusConfig } from "@/lib/workflow/types";

function assertLiveConfig(config: OpusConfig) {
  if (!config.enabled || config.mode !== "live" || !config.baseUrl || !config.authHeaderName || !config.endpoints) {
    throw new Error("Compliance backend integration requires docs configuration.");
  }
}

export async function opusRequest<T>(
  config: OpusConfig,
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  assertLiveConfig(config);

  const headers = new Headers(init.headers ?? {});
  headers.set(config.authHeaderName!, env.opusServiceKey);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Opus request failed (${response.status}): ${message}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export async function uploadToPresignedUrl(presignedUrl: string, bytes: ArrayBuffer, contentType: string) {
  const response = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body: bytes
  });

  if (!response.ok) {
    throw new Error(`Presigned upload failed (${response.status})`);
  }
}
