import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { assertSupabasePublicEnv, env } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  assertSupabasePublicEnv();
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string) {
        request.cookies.set(name, value);
        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });
        response.cookies.set(name, value);
      },
      remove(name: string) {
        request.cookies.set(name, "");
        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });
        response.cookies.set(name, "");
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  return { response, user };
}
