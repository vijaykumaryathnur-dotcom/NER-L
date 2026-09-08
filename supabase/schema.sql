-- ==============================================================================
-- NER LOGISTICS: Database Schema for Supabase PostgreSQL
-- Real Data Fleet, Telemetry, and Shipment Architecture
-- ==============================================================================

-- 1. Optional PostGIS Spatial Extensions (if enabled in project)
create extension if not exists postgis;

-- 2. Profiles Table (User Roles: admin, dispatcher, driver)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'driver' check (role in ('admin', 'dispatcher', 'driver')),
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Vehicles Table
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_number text unique not null,
  vehicle_type text not null check (vehicle_type in ('Heavy Truck', 'Medium Carrier', 'Refrigerated Van', 'Light Commercial', '4x4 Hill Runner')),
  assigned_driver_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'maintenance', 'offline')),
  current_lat double precision,
  current_lng double precision,
  current_speed double precision default 0,
  current_heading double precision default 0,
  current_accuracy double precision,
  last_ping timestamptz,
  created_at timestamptz default now()
);

-- 4. Shipments Table
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  tracking_id text unique not null,
  origin_name text not null,
  origin_lat double precision not null,
  origin_lng double precision not null,
  destination_name text not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  status text not null default 'Pending' check (status in ('Pending', 'Dispatched', 'In Transit', 'Delivered')),
  assigned_vehicle_id uuid references public.vehicles(id) on delete set null,
  estimated_delivery timestamptz,
  cargo_description text,
  created_at timestamptz default now()
);

-- 5. Telemetry History Table
create table if not exists public.telemetry (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid references public.profiles(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision default 0,
  heading double precision default 0,
  accuracy double precision,
  altitude double precision,
  recorded_at timestamptz default now()
);

-- Indices for rapid spatial and time-series queries
create index if not exists idx_telemetry_vehicle_time on public.telemetry(vehicle_id, recorded_at desc);
create index if not exists idx_vehicles_last_ping on public.vehicles(last_ping desc);
create index if not exists idx_shipments_status on public.shipments(status);

-- 6. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.shipments enable row level security;
alter table public.telemetry enable row level security;

-- Policies for profiles
create policy "Allow read profiles to authenticated users" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "Allow user to update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Policies for vehicles
create policy "Allow read vehicles to all authenticated users" on public.vehicles
  for select using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "Allow dispatchers and admins to insert/update vehicles" on public.vehicles
  for all using (
    auth.role() = 'service_role' or
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'dispatcher')
    )
  );

-- Policies for shipments
create policy "Allow read shipments to authenticated and anon" on public.shipments
  for select using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "Allow dispatchers and admins to manage shipments" on public.shipments
  for all using (
    auth.role() = 'service_role' or
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'dispatcher')
    )
  );

-- Policies for telemetry
create policy "Allow read telemetry to authenticated and anon" on public.telemetry
  for select using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "Allow drivers to insert own vehicle telemetry" on public.telemetry
  for insert with check (
    auth.role() = 'service_role' or
    (
      auth.uid() is not null and
      exists (
        select 1 from public.vehicles
        where vehicles.id = telemetry.vehicle_id
        and (vehicles.assigned_driver_id = auth.uid() or exists (
          select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'
        ))
      )
    )
  );

-- 7. Add Tables to Supabase Realtime Publication
alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.shipments;
alter publication supabase_realtime add table public.telemetry;

-- 8. Auto-create Profile Trigger on User Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'driver')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
