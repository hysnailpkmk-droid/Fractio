-- FRACTIO database schema (run once in Supabase > SQL Editor)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  class_name text,
  role text not null default 'student' check (role in ('student','teacher')),
  created_at timestamptz default now()
);

create table if not exists public.progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  learning boolean default false,
  laboratory boolean default false,
  challenge boolean default false,
  challenge_points int default 0,
  quiz_score int,
  updated_at timestamptz default now()
);

create table if not exists public.quiz_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null,
  correct_count int not null,
  total int not null,
  answers jsonb,
  created_at timestamptz default now()
);

create table if not exists public.reflections (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  new_learning text,
  most_helpful text,
  still_difficult text,
  created_at timestamptz default now()
);

create table if not exists public.responses (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  section text,
  question_key text,
  question_text text,
  answer text,
  is_correct boolean,
  created_at timestamptz default now()
);

-- Helper: is the current user a teacher? (security definer avoids RLS recursion)
create or replace function public.is_teacher()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

-- Auto-create a profile (always role = student) when someone registers
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, class_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'class_name',
    'student'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles     enable row level security;
alter table public.progress     enable row level security;
alter table public.quiz_results enable row level security;
alter table public.reflections  enable row level security;
alter table public.responses    enable row level security;

-- profiles: read own row (or all if teacher). No update policy => students cannot change their role.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select
  using (id = auth.uid() or public.is_teacher());

-- progress
drop policy if exists "progress read" on public.progress;
create policy "progress read" on public.progress for select
  using (user_id = auth.uid() or public.is_teacher());
drop policy if exists "progress insert" on public.progress;
create policy "progress insert" on public.progress for insert
  with check (user_id = auth.uid());
drop policy if exists "progress update" on public.progress;
create policy "progress update" on public.progress for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- quiz_results
drop policy if exists "quiz read" on public.quiz_results;
create policy "quiz read" on public.quiz_results for select
  using (user_id = auth.uid() or public.is_teacher());
drop policy if exists "quiz insert" on public.quiz_results;
create policy "quiz insert" on public.quiz_results for insert
  with check (user_id = auth.uid());

-- reflections
drop policy if exists "reflections read" on public.reflections;
create policy "reflections read" on public.reflections for select
  using (user_id = auth.uid() or public.is_teacher());
drop policy if exists "reflections insert" on public.reflections;
create policy "reflections insert" on public.reflections for insert
  with check (user_id = auth.uid());

-- responses
drop policy if exists "responses read" on public.responses;
create policy "responses read" on public.responses for select
  using (user_id = auth.uid() or public.is_teacher());
drop policy if exists "responses insert" on public.responses;
create policy "responses insert" on public.responses for insert
  with check (user_id = auth.uid());

-- ------------------------------------------------------------------
-- AFTER creating your teacher account (Authentication > Users > Add user,
-- tick "Auto Confirm User"), run this with the teacher's email:
--
--   update public.profiles set role = 'teacher'
--   where id = (select id from auth.users where email = 'YOUR_TEACHER_EMAIL');
-- ------------------------------------------------------------------
