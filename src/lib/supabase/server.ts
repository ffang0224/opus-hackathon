import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { assertSupabasePublicEnv, env } from "@/lib/env";

export function createSupabaseServerClient() {
  assertSupabasePublicEnv();
  const cookieStore = cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string) {
        cookieStore.set(name, value);
      },
      remove(name: string) {
        cookieStore.set(name, "");
      }
    }
  });
}
