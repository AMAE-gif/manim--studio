-- Manim NL Studio：项目表 + 公开读存储桶（MP4 由后端 Service Role 上传）
-- 在 Supabase Dashboard → SQL Editor 中执行本文件，或使用 CLI link 后 db push

create table if not exists public.manim_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null unique,
  prompt text,
  code text,
  status text not null default 'draft',
  storage_object_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manim_projects_user_id_created_at_idx
  on public.manim_projects (user_id, created_at desc);

alter table public.manim_projects enable row level security;

create policy "manim_projects_select_own"
  on public.manim_projects for select
  using (auth.uid() = user_id);

create policy "manim_projects_insert_own"
  on public.manim_projects for insert
  with check (auth.uid() = user_id);

create policy "manim_projects_update_own"
  on public.manim_projects for update
  using (auth.uid() = user_id);

create policy "manim_projects_delete_own"
  on public.manim_projects for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('renders', 'renders', true)
on conflict (id) do update set public = excluded.public;

create policy "renders_public_read"
  on storage.objects for select
  using (bucket_id = 'renders');

-- 说明：上传由后端使用 SUPABASE_SERVICE_ROLE_KEY 完成，不依赖客户端 Storage 写策略。
