import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NotificationCategory } from "@/lib/types/app";
import { requireRouteUser } from "@/lib/supabase/require-user";

const createNotificationSchema = z.object({
  category: z.enum(["vendor", "admin"]),
  message: z.string().min(1),
  recipientEmail: z.string().email().optional()
});

const patchNotificationSchema = z.object({
  notificationId: z.string().uuid(),
  isRead: z.boolean()
});

const deleteNotificationSchema = z.object({
  notificationId: z.string().uuid()
});

async function verifyOwnership(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  applicationId: string
) {
  const { data } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("created_by", userId)
    .single();
  return Boolean(data);
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  const category = request.nextUrl.searchParams.get("category") as NotificationCategory | null;

  if (!(await verifyOwnership(context.supabase, context.user.id, params.id))) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  let query = context.supabase
    .from("notifications")
    .select("id,category,recipient_email,message,is_read,created_at")
    .eq("application_id", params.id)
    .order("created_at", { ascending: false });

  if (category && ["vendor", "admin"].includes(category)) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  if (!(await verifyOwnership(context.supabase, context.user.id, params.id))) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const parsed = createNotificationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  const { data: notification, error } = await context.supabase
    .from("notifications")
    .insert({
      application_id: params.id,
      created_by: context.user.id,
      category: payload.category,
      recipient_user_id: payload.category === "admin" ? context.user.id : null,
      recipient_email: payload.category === "vendor" ? payload.recipientEmail ?? null : null,
      message: payload.message
    })
    .select("id,category,recipient_email,message,is_read,created_at")
    .single();

  if (error || !notification) {
    return NextResponse.json({ error: error?.message ?? "Failed to create notification" }, { status: 400 });
  }

  await context.supabase.from("audit_log").insert({
    application_id: params.id,
    actor_user_id: context.user.id,
    action: "notification_created",
    meta: payload
  });

  return NextResponse.json({ notification }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  if (!(await verifyOwnership(context.supabase, context.user.id, params.id))) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const parsed = patchNotificationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { notificationId, isRead } = parsed.data;

  const { data, error } = await context.supabase
    .from("notifications")
    .update({ is_read: isRead })
    .eq("id", notificationId)
    .eq("application_id", params.id)
    .select("id,category,recipient_email,message,is_read,created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Notification update failed" }, { status: 400 });
  }

  return NextResponse.json({ notification: data });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const context = await requireRouteUser();
  if ("error" in context) return context.error;

  if (!(await verifyOwnership(context.supabase, context.user.id, params.id))) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const parsed = deleteNotificationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await context.supabase
    .from("notifications")
    .delete()
    .eq("id", parsed.data.notificationId)
    .eq("application_id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await context.supabase.from("audit_log").insert({
    application_id: params.id,
    actor_user_id: context.user.id,
    action: "notification_deleted",
    meta: parsed.data
  });

  return NextResponse.json({ success: true });
}
