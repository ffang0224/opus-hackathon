"use client";

import { createBrowserClient } from "@supabase/ssr";

import { assertSupabasePublicEnv, env } from "@/lib/env";

export function createSupabaseBrowserClient() {
  assertSupabasePublicEnv();
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
