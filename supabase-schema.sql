-- ============================================================
-- G-AID Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. User profiles (mirrors auth.users, stores geophysics metadata)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  institution text,
  role        text default 'researcher',
  discipline  text,
  created_at  timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users can read/write own profile" on public.profiles;
create policy "Users can read/write own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, institution, role, discipline)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'institution',
    coalesce(new.raw_user_meta_data->>'role', 'researcher'),
    new.raw_user_meta_data->>'discipline'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Projects
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);
alter table public.projects enable row level security;
drop policy if exists "Users own their projects" on public.projects;
create policy "Users own their projects"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. File metadata (no file content — bytes live in Storage)
create table if not exists public.project_files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  name         text not null,
  storage_path text not null,
  size_bytes   bigint,
  mime_type    text,
  created_at   timestamptz default now()
);
alter table public.project_files enable row level security;
drop policy if exists "Users own their files" on public.project_files;
create policy "Users own their files"
  on public.project_files for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'geophysics-files',
  'geophysics-files',
  false,
  524288000, -- 500 MB per file
  null       -- allow all mime types
)
on conflict (id) do nothing;

drop policy if exists "Users upload to own folder" on storage.objects;
create policy "Users upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'geophysics-files' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own files" on storage.objects;
create policy "Users read own files"
  on storage.objects for select
  using (
    bucket_id = 'geophysics-files' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own files" on storage.objects;
create policy "Users delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'geophysics-files' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
