import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireRouteUser } from "@/lib/supabase/require-user";

const createApplicationSchema = z.object({
  vendor_name: z.string().min(1),
  notes: z.string().optional()
});

export async function GET(request: NextRequest) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const search = request.nextUrl.searchParams.get("search")?.trim();

  let query = context.supabase
    .from("applications")
    .select("id,vendor_name,status,created_at,updated_at")
    .eq("created_by", context.user.id)
    .order("updated_at", { ascending: false });

  if (search) {
    query = query.ilike("vendor_name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ applications: data ?? [] });
}

export async function POST(request: Request) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const parsed = createApplicationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { vendor_name, notes } = parsed.data;

  const { data: application, error } = await context.supabase
    .from("applications")
    .insert({
      vendor_name,
      status: "draft",
      created_by: context.user.id
    })
    .select("id,vendor_name,status,created_at,updated_at")
    .single();

  if (error || !application) {
    return NextResponse.json({ error: error?.message ?? "Failed to create application" }, { status: 400 });
  }

  await context.supabase.from("audit_log").insert({
    application_id: application.id,
    actor_user_id: context.user.id,
    action: "application_created",
    meta: {
      initial_notes: notes ?? null
    }
  });

  return NextResponse.json({ application }, { status: 201 });
}
