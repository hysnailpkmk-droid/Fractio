-- FRACTIO teacher access (run once in Supabase > SQL Editor, AFTER schema.sql)
--
-- Teachers can create their own account on teacher.html, but they must enter a
-- secret "teacher access code". The code is stored here in the database and is
-- never sent to the browser, so students cannot read it.
--
-- 1) Replace GANTI_KODE_GURU below with the code you want to give to teachers.
-- 2) Run the whole script.
-- To change the code later, run:
--    update public.app_secrets set value = 'NEW_CODE' where key = 'teacher_code';

create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);

-- RLS on with no policies = nobody can read this table through the API
alter table public.app_secrets enable row level security;

insert into public.app_secrets (key, value)
values ('teacher_code', 'GANTI_KODE_GURU')
on conflict (key) do update set value = excluded.value;

create or replace function public.claim_teacher(code text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or code is null then
    return false;
  end if;
  if exists (select 1 from public.app_secrets where key = 'teacher_code' and value = code) then
    update public.profiles set role = 'teacher' where id = auth.uid();
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.claim_teacher(text) from public, anon;
grant execute on function public.claim_teacher(text) to authenticated;
