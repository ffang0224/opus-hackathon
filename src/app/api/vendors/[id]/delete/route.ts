import { NextRequest, NextResponse } from "next/server";

import { requireRouteUser } from "@/lib/supabase/require-user";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const { error } = await context.supabase.from("vendors").delete().eq("id", params.id).eq("created_by", context.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/vendors", request.url));
}
