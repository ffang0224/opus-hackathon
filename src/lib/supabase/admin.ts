import { createClient } from "@supabase/supabase-js";

import { assertSupabasePublicEnv, env } from "@/lib/env";

export function createSupabaseAdminClient() {
  assertSupabasePublicEnv();
  if (!env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
