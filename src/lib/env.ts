export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  opusServiceKey: process.env.OPUS_SERVICE_KEY ?? "",
  opusBaseUrl: process.env.OPUS_BASE_URL ?? "",
  opusWorkflowId: process.env.OPUS_WORKFLOW_ID ?? "",
  demoMode: process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  demoModePublic: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  demoUserEmail: process.env.DEMO_USER_EMAIL ?? "demo@vendor-compliance.local",
  demoUserPassword: process.env.DEMO_USER_PASSWORD ?? "demo123456"
};

export function assertSupabasePublicEnv() {
  if (!env.supabaseUrl) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!env.supabaseAnonKey) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}
