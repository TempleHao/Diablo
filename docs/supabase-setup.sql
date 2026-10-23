-- 归墟 · Supabase 建表脚本（在 Supabase 后台 SQL Editor 里整段运行一次）
-- 账号：玩家注册时自动在 players 里建一行；账号名 = guixu_test 的自动标记为测试员（GM 面板只对测试员显示）。
-- 安全：所有表开启行级安全，玩家只能读写自己的数据；is_tester 只能在这里（数据库后台）修改，玩家改不了。

create table if not exists public.players (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  is_tester boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.characters (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 12),
  cls text not null,
  level int not null default 1 check (level between 1 and 100),
  difficulty int not null default 0 check (difficulty between 0 and 2),
  data jsonb not null check (pg_column_size(data) < 1500000),
  updated_at timestamptz not null default now()
);
create index if not exists characters_owner on public.characters(owner);
create table if not exists public.stashes (
  owner uuid primary key default auth.uid() references auth.users on delete cascade,
  items jsonb not null default '[]'::jsonb check (pg_column_size(items) < 500000),
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;
alter table public.characters enable row level security;
alter table public.stashes enable row level security;

drop policy if exists "read own player" on public.players;
create policy "read own player" on public.players for select using (id = auth.uid());
-- players 没有 insert / update 策略：玩家不能自己改 is_tester

drop policy if exists "own characters" on public.characters;
create policy "own characters" on public.characters for all using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "own stash" on public.stashes;
create policy "own stash" on public.stashes for all using (owner = auth.uid()) with check (owner = auth.uid());

-- 每个账号最多 12 个角色
create or replace function public.limit_characters() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.characters where owner = new.owner and id <> new.id) >= 12 then
    raise exception '角色已满（最多 12 个）';
  end if;
  return new;
end $$;
drop trigger if exists limit_characters on public.characters;
create trigger limit_characters before insert on public.characters for each row execute function public.limit_characters();

-- 注册时建玩家资料；账号名来自注册时的 username（邮箱 @ 前面的部分做后备）
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare uname text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
begin
  insert into public.players (id, username, is_tester) values (new.id, uname, uname = 'guixu_test');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 以后想把别的账号设成测试员（或取消）：
-- update public.players set is_tester = true where username = '账号名';

-- 补建：在建表之前就已注册的账号补一行玩家资料（guixu_test 标为测试员）。重复运行没有影响。
insert into public.players (id, username, is_tester)
select id, lower(coalesce(raw_user_meta_data->>'username', split_part(email, '@', 1))),
       lower(coalesce(raw_user_meta_data->>'username', split_part(email, '@', 1))) = 'guixu_test'
from auth.users
on conflict (id) do update set is_tester = excluded.is_tester or public.players.is_tester;

-- 让接口立即识别新表
notify pgrst, 'reload schema';
