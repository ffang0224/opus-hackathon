# Namaa Vendor Compliance (UAE)

Minimal Next.js 14 + Supabase web app for UAE vendor compliance applications.

## Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind + shadcn/ui
- Next.js Route Handlers for backend APIs
- Supabase Auth (email/password), Postgres, Storage

## Features in Scope
- Login with Supabase email/password
- Applications log with search/status
- 3-step create wizard
- Application detail with documents, contact info, compliance output
- Save application as vendor
- Application-local notifications (`vendor` + `admin`)
- Compliance backend integration:
  - Live mode (doc-driven only)
  - Manual paste mode (always available)
  - Auto-run on submit + auto-poll/auto-save on detail page

## Demo Workflow Note
- Vendor and admin are separated into dedicated tabs:
  - Vendor Portal: `/vendor/applications`
  - Admin Review: `/admin/applications`
- For hackathon demo speed, both roles still operate under one authenticated account.

## 1) Install
```bash
npm install
npm run dev
```

If you see errors like `Cannot find module './vendor-chunks/@supabase.js'`, stop the dev server and run:

```bash
rm -rf .next
npm run dev
```

## 2) Environment
Copy `.env.example` to `.env.local` and fill values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPUS_SERVICE_KEY` (optional for live mode)
- `OPUS_BASE_URL` (optional override)
- `OPUS_WORKFLOW_ID` (optional override)
- `DEMO_MODE` (optional, set `true` to enable server-side demo login route)
- `NEXT_PUBLIC_DEMO_MODE` (optional, set `true` to show demo login button)
- `DEMO_USER_EMAIL` (optional demo account email)
- `DEMO_USER_PASSWORD` (optional demo account password, min 6 chars)

## 3) Supabase Setup
1. Create a Supabase project.
2. Enable Email/Password auth in Supabase Authentication settings.
   - If you want sign-up to work instantly, disable email confirmation for now.
3. Run SQL migration from:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_application_documents_dedupe.sql`
4. Confirm bucket `vendor-docs` exists (migration creates it if missing).

### Quick Demo Login
If email flow is blocked in your environment:
1. Set `DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_MODE=true`.
2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set.
3. Open `/login` and click **Enter Demo Mode**.

## 4) Storage Bucket Rules
Bucket and policies are defined in migration for path format:

`{auth_uid}/{application_id}/{input_key}/{filename}`

## 5) Workflow Schema Location
App loads workflow schema in this order:
1. `documentation/workflow.json` (preferred)
2. `documentation/agents/workflow.json` (fallback)

The UI and execution payload are derived from `jobPayloadSchema` in workflow JSON (no hardcoded input key mapping).

## 6) Enable Live Compliance Backend Integration
Live mode is enabled only when docs + env are complete.

Required docs:
- `documentation/agents/opus-job-operator-api.md`
- Workflow JSON (`documentation/workflow.json` or fallback path)

Required env:
- `OPUS_SERVICE_KEY`
- Supabase variables

If docs/config are incomplete, UI shows:

`Compliance backend integration requires docs configuration.`

## 7) Manual Result Mode
Optional fallback on application detail page (collapsed by default).

1. Open `/applications/[id]`
2. Expand **Manual Admin Fallback (Optional)**
3. Paste result JSON
3. Click **Save Manual Result**

This stores `result_json`, creates audit log entries, and generates vendor/admin notifications with compliance work items.

## Pages
- `/login`
- `/applications`
- `/applications/new`
- `/applications/[id]`
- `/vendors`
- `/vendors/[id]`
