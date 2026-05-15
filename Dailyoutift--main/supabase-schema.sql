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

create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'free',
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

create table if not exists generation_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  action text not null,
  created_at timestamptz default now()
);

create table if not exists app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Repair older Supabase tables that were created before the current app schema.
-- Run this whole file again any time Supabase says a column is missing from the schema cache.
alter table outfits add column if not exists date date;
alter table outfits add column if not exists item_ids text[] default '{}';
alter table outfits add column if not exists description text default '';
alter table outfits add column if not exists style_notes text default '';
alter table outfits add column if not exists occasion text default 'Casual';
alter table outfits add column if not exists generated_at timestamptz default now();
alter table outfits add column if not exists preview_image text;

alter table wardrobe_items add column if not exists wear_count int default 0;
alter table wardrobe_items add column if not exists last_worn date;

alter table styles add column if not exists item_ids text[] default '{}';
alter table styles add column if not exists outfit_id text;
alter table styles add column if not exists source text default 'daily-preview';
alter table styles add column if not exists created_at timestamptz default now();
alter table subscriptions add column if not exists stripe_customer_id text;
alter table subscriptions add column if not exists stripe_subscription_id text;
alter table subscriptions add column if not exists status text default 'free';
alter table subscriptions add column if not exists price_id text;
alter table subscriptions add column if not exists current_period_end timestamptz;
alter table subscriptions add column if not exists updated_at timestamptz default now();

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table wardrobe_items enable row level security;
alter table outfits enable row level security;
alter table styles enable row level security;
alter table user_settings enable row level security;
alter table subscriptions enable row level security;
alter table generation_usage enable row level security;
alter table app_events enable row level security;

drop policy if exists "own wardrobe"   on wardrobe_items;
drop policy if exists "own outfits"    on outfits;
drop policy if exists "own styles"     on styles;
drop policy if exists "own settings"   on user_settings;
drop policy if exists "own subscriptions read" on subscriptions;
drop policy if exists "own usage read" on generation_usage;
drop policy if exists "own events insert" on app_events;

create policy "own wardrobe"  on wardrobe_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own outfits"   on outfits        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own styles"    on styles         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings"  on user_settings  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subscriptions read" on subscriptions for select using (auth.uid() = user_id);
create policy "own usage read" on generation_usage for select using (auth.uid() = user_id);
create policy "own events insert" on app_events for insert with check (auth.uid() = user_id);

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

-- Realtime. Run this once so the app receives live cross-device updates.
do $$
begin
  alter publication supabase_realtime add table wardrobe_items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table outfits;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table styles;
exception when duplicate_object then null;
end $$;

-- Fast per-user dashboard loads.
create index if not exists wardrobe_items_user_uploaded_idx on wardrobe_items (user_id, uploaded_at desc);
create index if not exists outfits_user_date_idx on outfits (user_id, date desc);
create index if not exists styles_user_created_idx on styles (user_id, created_at desc);
create index if not exists generation_usage_user_month_idx on generation_usage (user_id, month, created_at desc);
create index if not exists app_events_user_created_idx on app_events (user_id, created_at desc);
