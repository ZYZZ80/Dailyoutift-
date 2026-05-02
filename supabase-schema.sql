-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists wardrobe_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  color text default '',
  image text,
  tags text[] default '{}',
  uploaded_at timestamptz default now(),
  wear_count int default 0,
  last_worn date
);

create table if not exists outfits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  item_ids text[] default '{}',
  description text default '',
  style_notes text default '',
  occasion text default 'Casual',
  generated_at timestamptz default now(),
  preview_image text
);

create table if not exists styles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  image text not null,
  item_ids text[] default '{}',
  outfit_id text,
  source text not null,
  created_at timestamptz default now()
);

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text default 'proxy',
  api_key text default '',
  ollama_url text default 'http://localhost:11434',
  ollama_model text default 'moondream',
  profile_photos text[] default '{}'
);

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table wardrobe_items enable row level security;
alter table outfits enable row level security;
alter table styles enable row level security;
alter table user_settings enable row level security;

drop policy if exists "own wardrobe"   on wardrobe_items;
drop policy if exists "own outfits"    on outfits;
drop policy if exists "own styles"     on styles;
drop policy if exists "own settings"   on user_settings;

create policy "own wardrobe"  on wardrobe_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own outfits"   on outfits        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own styles"    on styles         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings"  on user_settings  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Storage Buckets ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('wardrobe', 'wardrobe', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('profile', 'profile', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('styles', 'styles', true)
on conflict (id) do nothing;

-- Drop old policies if they exist
drop policy if exists "user uploads"   on storage.objects;
drop policy if exists "user updates"   on storage.objects;
drop policy if exists "user deletes"   on storage.objects;
drop policy if exists "public reads"   on storage.objects;

create policy "user uploads" on storage.objects for insert
  with check (bucket_id in ('wardrobe', 'profile', 'styles') and auth.uid()::text = (storage.foldername(name))[1]);

create policy "user updates" on storage.objects for update
  using (bucket_id in ('wardrobe', 'profile', 'styles') and auth.uid()::text = (storage.foldername(name))[1]);

create policy "user deletes" on storage.objects for delete
  using (bucket_id in ('wardrobe', 'profile', 'styles') and auth.uid()::text = (storage.foldername(name))[1]);

create policy "public reads" on storage.objects for select
  using (bucket_id in ('wardrobe', 'profile', 'styles'));
