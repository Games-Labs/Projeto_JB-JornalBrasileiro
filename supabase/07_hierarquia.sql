-- =====================================================================
-- JB — Hierarquia da redação e perfis públicos (2026-11)
-- Para projetos criados com uma versão anterior do 01_schema.sql (rode depois do 05).
-- Instalação nova: o 01_schema.sql já contém tudo isto; NÃO rode este arquivo.
-- Pode ser rodado mais de uma vez (idempotente).
--
-- Cargos (do maior para o menor):
--   admin        tudo; dado SÓ pelo SQL Editor (supabase/03_promover_admin.sql)
--   coordenador  publica, arquiva, exclui e corrige qualquer matéria; denúncias, comentários,
--                autores e audiência; coloca/tira JORNALISTAS pelo painel
--   jornalista   cria e edita só as PRÓPRIAS matérias, até "Aprovada" (quem publica é o
--                coordenador); lê as matérias da redação; audiência
--   leitor       conta comum (padrão no cadastro)
-- O admin coloca qualquer pessoa como leitor, jornalista ou coordenador pelo painel.
-- Ninguém muda o próprio cargo, e admin não é alterado pelo painel.
--
-- Perfis públicos: nome, foto, bio, cargo e data de entrada de qualquer conta podem ser vistos
-- por todos (funções public_profile / staff_profiles). E-mail, cidade e interesses continuam
-- privados (só o dono lê; a tabela profiles segue com o RLS de antes).
-- =====================================================================

-- ---------- 1. Cargos ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'coordenador', 'jornalista', 'leitor'));

-- Cargo de quem está logado (null para visitante). SECURITY DEFINER evita recursão de RLS em profiles.
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
    select role from public.profiles where id = auth.uid();
$$;
-- Equipe da redação (admin, coordenador, jornalista)
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'coordenador', 'jornalista'));
$$;
-- Quem publica e administra a redação (admin, coordenador)
create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'coordenador'));
$$;

-- O cargo só muda pelo SQL Editor ou pela função set_member_role (que roda como dono do banco).
-- SECURITY INVOKER de propósito: current_user é 'authenticated' quando a mudança vem da API.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql security invoker set search_path = public
as $$
begin
    if new.role is distinct from old.role and current_user in ('anon', 'authenticated') then
        new.role := old.role;
    end if;
    return new;
end;
$$;

-- ---------- 2. Autoria das matérias (quem criou) ----------
alter table public.news add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists news_created_by_idx on public.news (created_by);

-- Pela API, o criador é sempre quem está logado e não muda depois (o SQL Editor pode ajustar).
create or replace function public.news_set_creator()
returns trigger
language plpgsql set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        if auth.uid() is not null then new.created_by := auth.uid(); end if;
    elsif auth.uid() is not null then
        new.created_by := old.created_by;
    end if;
    return new;
end;
$$;
drop trigger if exists news_set_creator on public.news;
create trigger news_set_creator
    before insert or update on public.news
    for each row execute function public.news_set_creator();

-- ---------- 3. Registro das mudanças de cargo ----------
create table if not exists public.role_changes (
    id              bigint generated always as identity primary key,
    target_id       uuid references public.profiles(id) on delete set null,
    target_name     text not null default '',
    old_role        text not null,
    new_role        text not null,
    changed_by      uuid references public.profiles(id) on delete set null,
    changed_by_name text not null default '',
    changed_at      timestamptz not null default now()
);
create index if not exists role_changes_at_idx on public.role_changes (changed_at desc);
create index if not exists role_changes_target_idx on public.role_changes (target_id);
create index if not exists role_changes_by_idx on public.role_changes (changed_by);
alter table public.role_changes enable row level security;

-- ---------- 4. Funções da hierarquia e dos perfis ----------
-- Perfil público: só nome, foto, bio, cargo e data de entrada (nunca e-mail, cidade ou interesses).
create or replace function public.public_profile(p_id uuid)
returns table (id uuid, name text, role text, bio text, avatar text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
    select p.id, p.name, p.role, p.bio, p.avatar, p.created_at from public.profiles p where p.id = p_id;
$$;

-- Equipe da redação (selo do JB): mesmos campos públicos.
create or replace function public.staff_profiles()
returns table (id uuid, name text, role text, bio text, avatar text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
    select p.id, p.name, p.role, p.bio, p.avatar, p.created_at
      from public.profiles p
     where p.role in ('admin', 'coordenador', 'jornalista')
     order by case p.role when 'admin' then 0 when 'coordenador' then 1 else 2 end, p.name;
$$;

-- Lista de contas para a aba Equipe do painel (só coordenador e admin). O e-mail serve para
-- identificar a pessoa certa; a foto fica de fora (a lista seria pesada).
create or replace function public.list_members(p_query text default '')
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare q text := '%' || replace(replace(replace(coalesce(trim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
    if not public.is_editor() then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    return query
        select p.id, p.name, u.email::text, p.role, p.created_at
          from public.profiles p
          join auth.users u on u.id = p.id
         where p.name ilike q or u.email ilike q
         order by case p.role when 'admin' then 0 when 'coordenador' then 1 when 'jornalista' then 2 else 3 end, p.name
         limit 200;
end;
$$;

-- Muda o cargo de alguém seguindo a hierarquia (e registra em role_changes).
create or replace function public.set_member_role(p_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
    me  text := public.my_role();
    cur text;
begin
    if auth.uid() is null or me is null or me not in ('admin', 'coordenador') then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    if p_id = auth.uid() then
        raise exception 'não é possível alterar o próprio cargo' using errcode = '42501';
    end if;
    if p_role is null or p_role not in ('leitor', 'jornalista', 'coordenador') then
        raise exception 'cargo inválido' using errcode = '22023';
    end if;
    select role into cur from public.profiles where id = p_id for update;
    if cur is null then
        raise exception 'conta não encontrada' using errcode = 'P0002';
    end if;
    if cur = 'admin' then
        raise exception 'administradores só podem ser alterados pelo SQL Editor' using errcode = '42501';
    end if;
    if me = 'coordenador' and (cur not in ('leitor', 'jornalista') or p_role not in ('leitor', 'jornalista')) then
        raise exception 'coordenadores só colocam ou tiram jornalistas' using errcode = '42501';
    end if;
    if cur = p_role then
        return;
    end if;
    update public.profiles set role = p_role where id = p_id;
    insert into public.role_changes (target_id, target_name, old_role, new_role, changed_by, changed_by_name)
    select p_id, t.name, cur, p_role, auth.uid(), coalesce((select b.name from public.profiles b where b.id = auth.uid()), '')
      from public.profiles t where t.id = p_id;
end;
$$;

revoke execute on function public.protect_profile_role() from public, anon, authenticated;
revoke execute on function public.news_set_creator() from public, anon, authenticated;
revoke all on function public.list_members(text) from public, anon;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.list_members(text) to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.my_role(), public.is_staff(), public.is_editor() to anon, authenticated;
grant execute on function public.public_profile(uuid), public.staff_profiles() to anon, authenticated;

-- ---------- 5. Políticas (RLS) ----------
-- news: público lê só publicadas cuja data chegou; a equipe lê todas.
drop policy if exists "news: ler publicadas ou admin" on public.news;
drop policy if exists "news: ler publicadas ou equipe" on public.news;
create policy "news: ler publicadas ou equipe" on public.news
    for select to anon, authenticated using ((status = 'publicada' and date <= now()) or (select public.is_staff()));

-- Coordenador/admin: tudo. Jornalista: só as próprias e só até "aprovada".
drop policy if exists "news: admin cria" on public.news;
drop policy if exists "news: equipe cria" on public.news;
create policy "news: equipe cria" on public.news
    for insert to authenticated with check (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista' and created_by = (select auth.uid()) and status in ('rascunho', 'revisao', 'aprovada')));

drop policy if exists "news: admin edita" on public.news;
drop policy if exists "news: equipe edita" on public.news;
create policy "news: equipe edita" on public.news
    for update to authenticated
    using (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista' and created_by = (select auth.uid()) and status in ('rascunho', 'revisao', 'aprovada')))
    with check (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista' and created_by = (select auth.uid()) and status in ('rascunho', 'revisao', 'aprovada')));

drop policy if exists "news: admin exclui" on public.news;
drop policy if exists "news: editor exclui" on public.news;
create policy "news: editor exclui" on public.news
    for delete to authenticated using ((select public.is_editor()));

-- news_versions: coordenador/admin; jornalista só das próprias matérias.
drop policy if exists "versions: admin le" on public.news_versions;
drop policy if exists "versions: equipe le" on public.news_versions;
create policy "versions: equipe le" on public.news_versions
    for select to authenticated using (
        (select public.is_editor())
        or ((select public.is_staff()) and exists (select 1 from public.news n where n.id = news_versions.news_id and n.created_by = (select auth.uid()))));
drop policy if exists "versions: admin exclui" on public.news_versions;
drop policy if exists "versions: editor exclui" on public.news_versions;
create policy "versions: editor exclui" on public.news_versions
    for delete to authenticated using ((select public.is_editor()));

-- comments: moderação passa a ser do coordenador também.
drop policy if exists "comments: ler" on public.comments;
create policy "comments: ler" on public.comments
    for select to anon, authenticated using (
        (select public.is_editor()) or exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
drop policy if exists "comments: excluir proprio ou admin" on public.comments;
drop policy if exists "comments: excluir proprio ou editor" on public.comments;
create policy "comments: excluir proprio ou editor" on public.comments
    for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_editor()));

-- reports e newsletter: coordenador/admin.
drop policy if exists "reports: admin le" on public.reports;
drop policy if exists "reports: editor le" on public.reports;
create policy "reports: editor le" on public.reports
    for select to authenticated using ((select public.is_editor()));
drop policy if exists "reports: admin exclui" on public.reports;
drop policy if exists "reports: editor exclui" on public.reports;
create policy "reports: editor exclui" on public.reports
    for delete to authenticated using ((select public.is_editor()));
drop policy if exists "newsletter: admin le" on public.newsletter;
drop policy if exists "newsletter: editor le" on public.newsletter;
create policy "newsletter: editor le" on public.newsletter
    for select to authenticated using ((select public.is_editor()));

-- authors: coordenador/admin.
drop policy if exists "authors: admin cria" on public.authors;
drop policy if exists "authors: editor cria" on public.authors;
create policy "authors: editor cria" on public.authors
    for insert to authenticated with check ((select public.is_editor()));
drop policy if exists "authors: admin edita" on public.authors;
drop policy if exists "authors: editor edita" on public.authors;
create policy "authors: editor edita" on public.authors
    for update to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
drop policy if exists "authors: admin exclui" on public.authors;
drop policy if exists "authors: editor exclui" on public.authors;
create policy "authors: editor exclui" on public.authors
    for delete to authenticated using ((select public.is_editor()));

-- role_changes: coordenador/admin leem; só set_member_role grava.
drop policy if exists "role_changes: editor le" on public.role_changes;
create policy "role_changes: editor le" on public.role_changes
    for select to authenticated using ((select public.is_editor()));
revoke all on public.role_changes from anon, authenticated;
grant select on public.role_changes to authenticated;

-- Storage (imagens): a equipe envia; trocar/apagar só coordenador/admin ou quem enviou o arquivo.
drop policy if exists "news-images: admin lista" on storage.objects;
drop policy if exists "news-images: equipe lista" on storage.objects;
create policy "news-images: equipe lista" on storage.objects
    for select to authenticated using (bucket_id = 'news-images' and (select public.is_staff()));
drop policy if exists "news-images: admin envia" on storage.objects;
drop policy if exists "news-images: equipe envia" on storage.objects;
create policy "news-images: equipe envia" on storage.objects
    for insert to authenticated with check (bucket_id = 'news-images' and (select public.is_staff()));
drop policy if exists "news-images: admin troca" on storage.objects;
drop policy if exists "news-images: editor ou dono troca" on storage.objects;
create policy "news-images: editor ou dono troca" on storage.objects
    for update to authenticated
    using (bucket_id = 'news-images' and ((select public.is_editor()) or ((select public.is_staff()) and owner_id = (select auth.uid())::text)))
    with check (bucket_id = 'news-images' and ((select public.is_editor()) or ((select public.is_staff()) and owner_id = (select auth.uid())::text)));
drop policy if exists "news-images: admin apaga" on storage.objects;
drop policy if exists "news-images: editor ou dono apaga" on storage.objects;
create policy "news-images: editor ou dono apaga" on storage.objects
    for delete to authenticated
    using (bucket_id = 'news-images' and ((select public.is_editor()) or ((select public.is_staff()) and owner_id = (select auth.uid())::text)));
