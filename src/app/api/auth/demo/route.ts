import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DUPLICATE_USER_ERROR = /(already|registered|exists|duplicate)/i;

async function findUserByEmail(email: string): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const perPage = 200;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return null;
}

async function ensureDemoUser() {
  const admin = createSupabaseAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email: env.demoUserEmail,
    password: env.demoUserPassword,
    email_confirm: true
  });

  if (!error) {
    return;
  }

  if (!DUPLICATE_USER_ERROR.test(error.message)) {
    throw error;
  }

  const existing = await findUserByEmail(env.demoUserEmail);
  if (!existing) {
    throw new Error("Demo user exists but could not be loaded");
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password: env.demoUserPassword,
    email_confirm: true
  });

  if (updateError) {
    throw updateError;
  }
}

export async function POST() {
  if (!env.demoMode) {
    return NextResponse.json({ error: "Demo mode is disabled." }, { status: 403 });
  }

  if (!env.demoUserEmail || !env.demoUserPassword) {
    return NextResponse.json({ error: "Demo mode credentials are missing." }, { status: 500 });
  }

  if (env.demoUserPassword.length < 6) {
    return NextResponse.json({ error: "DEMO_USER_PASSWORD must be at least 6 characters." }, { status: 500 });
  }

  try {
    await ensureDemoUser();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to prepare demo user." },
      { status: 500 }
    );
  }

  const supabase = createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: env.demoUserEmail,
    password: env.demoUserPassword
  });

  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    demoUser: env.demoUserEmail
  });
}
