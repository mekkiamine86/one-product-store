-- =============================================================================
-- One Product Store — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================================

-- Products table (single product, but stored as a row for easy editing)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  price numeric(10, 2) not null,
  currency text not null default 'دج',
  image_url text not null,
  updated_at timestamptz not null default now()
);

-- Orders table
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  product_name text not null,
  product_price numeric(10, 2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

alter table public.products enable row level security;
alter table public.orders   enable row level security;

-- Products: anyone can READ (it's a public storefront)
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products for select
  to anon, authenticated
  using (true);

-- Orders: anyone can INSERT (customers placing orders)
-- Reading/updating is done server-side using the SERVICE_ROLE_KEY (bypasses RLS).
drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert"
  on public.orders for insert
  to anon, authenticated
  with check (true);

-- =============================================================================
-- Seed: insert a default product if the table is empty
-- =============================================================================

insert into public.products (name, description, price, currency, image_url)
select
  'منتج مميز',
  'منتج عالي الجودة مصمم بعناية فائقة. تجربة استثنائية تستحق التجربة.',
  4999.00,
  'دج',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&q=80'
where not exists (select 1 from public.products);
