create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_json jsonb not null default '{}'::jsonb,
  latest_compliance_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  updated_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, created_by)
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  vendor_name text not null,
  status text not null default 'draft',
  contact_json jsonb not null default '{}'::jsonb,
  result_json jsonb,
  reviewer_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_status_check check (status in ('draft', 'submitted', 'reviewed', 'approved', 'rejected'))
);

create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  input_key text not null,
  storage_path text not null,
  filename text not null,
  mime_type text not null,
  size integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('vendor', 'admin')),
  recipient_user_id uuid references auth.users (id) on delete set null,
  recipient_email text,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at
before update on public.vendors
for each row
execute procedure public.handle_updated_at();

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
before update on public.applications
for each row
execute procedure public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.applications enable row level security;
alter table public.application_documents enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;

create policy "profiles own rows"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "vendors own rows"
on public.vendors
for all
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

create policy "applications own rows"
on public.applications
for all
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

create policy "documents by application ownership"
on public.application_documents
for all
using (
  exists (
    select 1
    from public.applications a
    where a.id = application_id and a.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.applications a
    where a.id = application_id and a.created_by = auth.uid()
  )
);

create policy "audit by application ownership"
on public.audit_log
for all
using (
  exists (
    select 1
    from public.applications a
    where a.id = application_id and a.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.applications a
    where a.id = application_id and a.created_by = auth.uid()
  )
);

create policy "notifications by application ownership"
on public.notifications
for all
using (
  exists (
    select 1
    from public.applications a
    where a.id = application_id and a.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.applications a
    where a.id = application_id and a.created_by = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('vendor-docs', 'vendor-docs', false)
on conflict (id) do nothing;

create policy "vendor docs read own prefix"
on storage.objects
for select
using (
  bucket_id = 'vendor-docs'
  and position((auth.uid())::text || '/' in name) = 1
);

create policy "vendor docs insert own prefix"
on storage.objects
for insert
with check (
  bucket_id = 'vendor-docs'
  and position((auth.uid())::text || '/' in name) = 1
);

create policy "vendor docs update own prefix"
on storage.objects
for update
using (
  bucket_id = 'vendor-docs'
  and position((auth.uid())::text || '/' in name) = 1
)
with check (
  bucket_id = 'vendor-docs'
  and position((auth.uid())::text || '/' in name) = 1
);

create policy "vendor docs delete own prefix"
on storage.objects
for delete
using (
  bucket_id = 'vendor-docs'
  and position((auth.uid())::text || '/' in name) = 1
);
