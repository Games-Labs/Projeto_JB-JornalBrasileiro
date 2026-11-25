-- =====================================================================
-- JB — Selos, colaboradores das matérias, modo lockdown e canal de denúncias com conta (2026-11)
-- Para projetos criados com uma versão anterior do 01_schema.sql (rode depois do 09).
-- Instalação nova: o 01_schema.sql já contém tudo isto; NÃO rode este arquivo.
-- Pode ser rodado mais de uma vez (idempotente).
--
-- 1. Selos de perfil (profiles.badges): Colaborador, Apoiador Oficial, Ajudante do Jornal e
--    Repórter. Independentes do cargo; só coordenador/admin dão ou tiram, pela função
--    set_member_badges (a própria conta não consegue: o update da API é por coluna e não inclui
--    badges). Aparecem no perfil público, nos comentários e na página da equipe.
-- 2. Autores oficiais (authors.official): perfis da redação (Redação JB, Núcleo de Verificação…)
--    ganham o selo do JB. Os autores que não são colunistas já cadastrados passam a ser oficiais.
-- 3. Matérias com coautores (news.coauthors, aparecem na assinatura e entram no histórico de
--    versões) e colaboradores de edição (news.editors: jornalistas que podem editar a matéria
--    junto com quem a criou, até "Aprovada"). Só quem criou ou coordenador/admin mudam a lista.
-- 4. Modo lockdown (aba Segurança do painel): fecha o site para quem não é da equipe. O banco
--    passa a recusar leitura de matérias, comentários, autores, leituras e perfis públicos,
--    envio de denúncias/comentários/newsletter, favoritos, edição de perfil e cadastros novos
--    para quem não é jornalista/coordenador/admin com a conta liberada (MFA).
-- 5. Comentar e denunciar exigem conta (logada e liberada). A opção "anônima" da denúncia
--    continua não enviando nome e e-mail para a redação.
-- 6. Denúncias com vários anexos (até 6 imagens/PDFs) guardados no bucket PRIVADO report-files:
--    só coordenador/admin abrem (link temporário). As imagens são reduzidas no navegador antes do
--    envio, o que também remove os metadados (EXIF, GPS).
-- =====================================================================

-- ---------- 0. Modo lockdown: estado do site ----------
create table if not exists public.site_settings (
    id               int primary key default 1 constraint site_settings_single check (id = 1),
    lockdown         boolean not null default false,
    lockdown_message text not null default '' check (char_length(lockdown_message) <= 500),
    changed_at       timestamptz,
    changed_by_name  text not null default ''
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;   -- só pelas funções abaixo

-- true = site fechado para quem não é da equipe
create or replace function public.site_locked()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select s.lockdown from public.site_settings s where s.id = 1), false) $$;

-- Estado público (o site mostra a tela de lockdown). A mensagem só aparece com o site fechado.
create or replace function public.site_status()
returns jsonb
language sql stable security definer set search_path = public
as $$
    select jsonb_build_object('lockdown', s.lockdown, 'message', case when s.lockdown then s.lockdown_message else '' end,
                              'since', case when s.lockdown then s.changed_at end)
      from public.site_settings s where s.id = 1;
$$;

-- Liga/desliga (coordenador e admin, com a conta liberada). Fica na auditoria.
create or replace function public.set_lockdown(p_on boolean, p_message text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare msg text := left(coalesce(trim(p_message), ''), 500);
begin
    if not public.is_editor() then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    update public.site_settings
       set lockdown = coalesce(p_on, false), lockdown_message = msg, changed_at = now(),
           changed_by_name = coalesce((select p.name from public.profiles p where p.id = auth.uid()), '')
     where id = 1;
    perform public.audit(case when coalesce(p_on, false) then 'site.lockdown_on' else 'site.lockdown_off' end,
                         'site', '1', 'Modo lockdown', jsonb_build_object('message', left(msg, 200)));
end;
$$;

-- ---------- 1. Selos de perfil ----------
alter table public.profiles add column if not exists badges text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_badges_check;
alter table public.profiles add constraint profiles_badges_check
    check (badges <@ array['colaborador', 'apoiador', 'ajudante', 'reporter']::text[] and cardinality(badges) <= 4);

-- Dá ou tira selos. Coordenador: só em leitores e jornalistas. Admin: em qualquer conta, menos
-- administradores. Ninguém mexe nos próprios selos.
create or replace function public.set_member_badges(p_id uuid, p_badges text[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
    me  text := public.my_role();
    cur text;
    nb  text[];
begin
    if auth.uid() is null or me is null or me not in ('admin', 'coordenador') then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    if p_id = auth.uid() then
        raise exception 'não é possível alterar os próprios selos' using errcode = '42501';
    end if;
    select coalesce(array_agg(distinct b order by b), '{}') into nb
      from unnest(coalesce(p_badges, '{}')) b where b is not null;
    if not (nb <@ array['colaborador', 'apoiador', 'ajudante', 'reporter']::text[]) then
        raise exception 'selo inválido' using errcode = '22023';
    end if;
    select role into cur from public.profiles where id = p_id for update;
    if cur is null then
        raise exception 'conta não encontrada' using errcode = 'P0002';
    end if;
    if cur = 'admin' then
        raise exception 'administradores só podem ser alterados pelo SQL Editor' using errcode = '42501';
    end if;
    if me = 'coordenador' and cur not in ('leitor', 'jornalista') then
        raise exception 'coordenadores só dão selos a leitores e jornalistas' using errcode = '42501';
    end if;
    update public.profiles set badges = nb where id = p_id;
end;
$$;

-- Toda mudança de selo (pelo painel ou pelo SQL Editor) vai para a auditoria
create or replace function public.audit_profile_badges()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if new.badges is distinct from old.badges then
        perform public.audit('badge.change', 'profile', new.id::text, new.name, jsonb_build_object('from', old.badges, 'to', new.badges));
    end if;
    return null;
end;
$$;
drop trigger if exists audit_profile_badges on public.profiles;
create trigger audit_profile_badges after update of badges on public.profiles
    for each row execute function public.audit_profile_badges();

-- Perfis públicos passam a devolver os selos (o tipo de retorno mudou: recria as funções).
-- Com o site em lockdown, só a equipe enxerga os perfis.
drop function if exists public.public_profile(uuid);
create function public.public_profile(p_id uuid)
returns table (id uuid, name text, role text, bio text, avatar text, created_at timestamptz, badges text[])
language sql stable security definer set search_path = public
as $$
    select p.id, p.name, p.role, p.bio, p.avatar, p.created_at, p.badges
      from public.profiles p
     where p.id = p_id and (not public.site_locked() or public.is_staff());
$$;

-- Equipe da redação (selo do JB) e contas com algum selo de perfil
drop function if exists public.staff_profiles();
create function public.staff_profiles()
returns table (id uuid, name text, role text, bio text, avatar text, created_at timestamptz, badges text[])
language sql stable security definer set search_path = public
as $$
    select p.id, p.name, p.role, p.bio, p.avatar, p.created_at, p.badges
      from public.profiles p
     where (p.role in ('admin', 'coordenador', 'jornalista') or cardinality(p.badges) > 0)
       and (not public.site_locked() or public.is_staff())
     order by case p.role when 'admin' then 0 when 'coordenador' then 1 when 'jornalista' then 2 else 3 end, p.name;
$$;

drop function if exists public.list_members(text);
create function public.list_members(p_query text default '')
returns table (id uuid, name text, email text, role text, created_at timestamptz, badges text[])
language plpgsql stable security definer set search_path = public
as $$
declare q text := '%' || replace(replace(replace(coalesce(trim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
    if not public.is_editor() then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    return query
        select p.id, p.name, u.email::text, p.role, p.created_at, p.badges
          from public.profiles p
          join auth.users u on u.id = p.id
         where p.name ilike q or u.email ilike q
         order by case p.role when 'admin' then 0 when 'coordenador' then 1 when 'jornalista' then 2 else 3 end,
                  cardinality(p.badges) desc, p.name
         limit 200;
end;
$$;

-- ---------- 2. Autores oficiais (selo do JB nos perfis da redação) ----------
do $$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'authors' and column_name = 'official') then
        alter table public.authors add column official boolean not null default false;
        update public.authors set official = true where not columnist;   -- só na primeira vez
    end if;
end $$;
grant insert (id, name, role, bio, avatar, columnist, official) on public.authors to authenticated;
grant update (name, role, bio, avatar, columnist, official)     on public.authors to authenticated;

-- ---------- 3. Coautores e colaboradores de edição ----------
alter table public.news add column if not exists coauthors text[] not null default '{}';
alter table public.news add column if not exists editors uuid[] not null default '{}';
alter table public.news drop constraint if exists news_coauthors_check;
alter table public.news add constraint news_coauthors_check
    check (cardinality(coauthors) <= 10 and array_position(coauthors, null) is null and char_length(array_to_string(coauthors, '')) <= 1200);
alter table public.news drop constraint if exists news_editors_check;
alter table public.news add constraint news_editors_check check (cardinality(editors) <= 10 and array_position(editors, null) is null);
create index if not exists news_editors_idx on public.news using gin (editors);

-- Pela API, só quem criou a matéria (ou coordenador/admin) muda a lista de colaboradores.
-- (roda depois de news_set_creator: os gatilhos BEFORE seguem a ordem alfabética do nome)
create or replace function public.news_set_editors()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_editor()
       and auth.uid() is distinct from old.created_by then
        new.editors := old.editors;
    end if;
    new.editors := coalesce((select array_agg(distinct e) from unnest(new.editors) e
                              where e is not null and e is distinct from new.created_by), '{}');
    return new;
end;
$$;
drop trigger if exists news_set_editors on public.news;
create trigger news_set_editors
    before insert or update on public.news
    for each row execute function public.news_set_editors();

-- Jornalista edita as próprias matérias e aquelas em que é colaborador (até "Aprovada")
drop policy if exists "news: equipe edita" on public.news;
create policy "news: equipe edita" on public.news
    for update to authenticated
    using (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista'
            and (created_by = (select auth.uid()) or (select auth.uid()) = any (editors))
            and status in ('rascunho', 'revisao', 'aprovada')))
    with check (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista'
            and (created_by = (select auth.uid()) or (select auth.uid()) = any (editors))
            and status in ('rascunho', 'revisao', 'aprovada')));

drop policy if exists "versions: equipe le" on public.news_versions;
create policy "versions: equipe le" on public.news_versions
    for select to authenticated using (
        (select public.is_editor())
        or ((select public.is_staff()) and exists (select 1 from public.news n where n.id = news_versions.news_id
                and (n.created_by = (select auth.uid()) or (select auth.uid()) = any (n.editors)))));

-- Coautores entram no histórico de versões
create or replace function public.news_track_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict,
        new.sources, new.timeline, new.people, new.chart, new.video, new.coauthors)
       is distinct from
       (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict,
        old.sources, old.timeline, old.people, old.chart, old.video, old.coauthors) then
        insert into public.news_versions (news_id, replaced_by, snapshot)
        values (old.id,
                coalesce((select left(p.name, 120) from public.profiles p where p.id = auth.uid()), ''),
                jsonb_build_object('title', old.title, 'subtitle', old.subtitle, 'body', old.body, 'image', old.image,
                                   'author', old.author, 'category', old.category, 'kind', old.kind, 'verdict', old.verdict,
                                   'sources', old.sources, 'timeline', old.timeline, 'people', old.people, 'chart', old.chart,
                                   'video', old.video, 'coauthors', to_jsonb(old.coauthors)));
        delete from public.news_versions
         where news_id = old.id
           and id not in (select id from public.news_versions where news_id = old.id order by replaced_at desc, id desc limit 20);
        new.updated_at := now();
    elsif (new.updates, new.corrections) is distinct from (old.updates, old.corrections) then
        new.updated_at := now();
    else
        new.updated_at := old.updated_at;
    end if;
    return new;
end;
$$;

create or replace function public.audit_news()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        perform public.audit('news.create', 'news', new.id::text, new.title, jsonb_build_object('status', new.status, 'kind', new.kind));
    elsif tg_op = 'DELETE' then
        perform public.audit('news.delete', 'news', old.id::text, old.title, jsonb_build_object('status', old.status));
    else
        if new.status is distinct from old.status then
            perform public.audit('news.status', 'news', new.id::text, new.title, jsonb_build_object('from', old.status, 'to', new.status));
        end if;
        if (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict, new.sources, new.timeline, new.people, new.chart, new.corrections, new.video, new.coauthors)
           is distinct from
           (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict, old.sources, old.timeline, old.people, old.chart, old.corrections, old.video, old.coauthors) then
            perform public.audit('news.edit', 'news', new.id::text, new.title, '{}'::jsonb);
        end if;
        if new.editors is distinct from old.editors then
            perform public.audit('news.editors', 'news', new.id::text, new.title,
                jsonb_build_object('count', cardinality(new.editors),
                    'names', (select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb) from public.profiles p where p.id = any (new.editors))));
        end if;
        if new.featured and not old.featured then
            perform public.audit('news.featured', 'news', new.id::text, new.title, '{}'::jsonb);
        end if;
    end if;
    return null;
end;
$$;

-- ---------- 4. Modo lockdown: travas no banco ----------
-- Políticas RESTRITIVAS: valem junto com as já existentes. Com o site aberto não mudam nada.
drop policy if exists "lockdown: news" on public.news;
create policy "lockdown: news" on public.news
    as restrictive for select to anon, authenticated using (not (select public.site_locked()) or (select public.is_staff()));
drop policy if exists "lockdown: comments" on public.comments;
create policy "lockdown: comments" on public.comments
    as restrictive for all to anon, authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
drop policy if exists "lockdown: reports" on public.reports;
create policy "lockdown: reports" on public.reports
    as restrictive for all to anon, authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
drop policy if exists "lockdown: newsletter" on public.newsletter;
create policy "lockdown: newsletter" on public.newsletter
    as restrictive for all to anon, authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
drop policy if exists "lockdown: favorites" on public.favorites;
create policy "lockdown: favorites" on public.favorites
    as restrictive for all to authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
drop policy if exists "lockdown: authors" on public.authors;
create policy "lockdown: authors" on public.authors
    as restrictive for all to anon, authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
drop policy if exists "lockdown: views" on public.news_views;
create policy "lockdown: views" on public.news_views
    as restrictive for select to anon, authenticated using (not (select public.site_locked()) or (select public.is_staff()));
drop policy if exists "lockdown: profiles" on public.profiles;
create policy "lockdown: profiles" on public.profiles
    as restrictive for update to authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));

-- Leituras não contam com o site fechado
create or replace function public.hit_news(p_id uuid)
returns void
language sql security definer set search_path = public
as $$
    insert into public.news_views (news_id, count)
    select id, 1 from public.news where id = p_id and status = 'publicada' and date <= now() and not public.site_locked()
    on conflict (news_id) do update set count = public.news_views.count + 1;
$$;

-- Cadastros novos ficam suspensos durante o lockdown
create or replace function public.check_signup_age()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare b date;
begin
    if public.site_locked() then
        raise exception 'JB: cadastros suspensos (modo lockdown)' using errcode = '42501';
    end if;
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'jb_age_ok';
    if new.raw_user_meta_data ? 'birth_date' then
        begin
            b := (new.raw_user_meta_data ->> 'birth_date')::date;
        exception when others then
            b := null;
        end;
        new.raw_user_meta_data := new.raw_user_meta_data - 'birth_date';
        if b is null or b < date '1900-01-01' or b > (current_date - make_interval(years => public.min_age()))::date then
            raise exception 'JB: idade mínima de % anos', public.min_age() using errcode = '22023';
        end if;
        new.raw_user_meta_data := new.raw_user_meta_data || '{"jb_age_ok": true}'::jsonb;
    end if;
    return new;
end;
$$;

-- ---------- 5. Comentar e denunciar exigem conta ----------
drop policy if exists "comments: criar" on public.comments;
create policy "comments: criar" on public.comments
    for insert to authenticated with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
revoke insert on public.comments from anon;

drop policy if exists "reports: enviar" on public.reports;
drop policy if exists "reports: conta envia" on public.reports;
create policy "reports: conta envia" on public.reports
    for insert to authenticated with check ((select public.account_ok()));
revoke insert on public.reports from anon;

-- ---------- 6. Anexos das denúncias (bucket privado) ----------
-- Cada anexo: {path: "<uuid>/<uuid>.jpg|webp|png|pdf", name, size, type}. Até 6.
create or replace function public.report_attachments_ok(a jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
    select case when a is null or jsonb_typeof(a) <> 'array' then false
                else jsonb_array_length(a) <= 6 and pg_column_size(a) <= 6000
                     and not exists (select 1 from jsonb_array_elements(a) e
                                      where jsonb_typeof(e) <> 'object'
                                         or coalesce(e ->> 'path', '') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp|png|pdf)$'
                                         or char_length(coalesce(e ->> 'name', '')) > 200) end;
$$;
alter table public.reports add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.reports drop constraint if exists reports_attachments_check;
alter table public.reports add constraint reports_attachments_check check (public.report_attachments_ok(attachments));
grant insert (id, subject, story, anonymous, name, email, attachment, attachments) on public.reports to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-files', 'report-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Envio: conta liberada, site aberto (ou equipe) e no máximo 20 arquivos por conta a cada 10 minutos
create or replace function public.report_upload_ok()
returns boolean
language sql stable security definer set search_path = public
as $$
    select public.account_ok()
       and (not public.site_locked() or public.is_staff())
       and (select count(*) from storage.objects o
             where o.bucket_id = 'report-files' and o.owner_id = (select auth.uid())::text
               and o.created_at > now() - interval '10 minutes') < 20;
$$;

drop policy if exists "report-files: conta envia" on storage.objects;
create policy "report-files: conta envia" on storage.objects
    for insert to authenticated with check (bucket_id = 'report-files' and (select public.report_upload_ok()));
drop policy if exists "report-files: editor le" on storage.objects;
create policy "report-files: editor le" on storage.objects
    for select to authenticated using (bucket_id = 'report-files' and (select public.is_editor()));
drop policy if exists "report-files: editor apaga" on storage.objects;
create policy "report-files: editor apaga" on storage.objects
    for delete to authenticated using (bucket_id = 'report-files' and (select public.is_editor()));

-- ---------- 7. Privilégios das funções ----------
revoke all on function public.site_locked() from public;
revoke all on function public.site_status() from public;
revoke all on function public.set_lockdown(boolean, text) from public, anon;
revoke all on function public.set_member_badges(uuid, text[]) from public, anon;
revoke all on function public.audit_profile_badges() from public, anon, authenticated;
revoke all on function public.news_set_editors() from public, anon, authenticated;
revoke all on function public.report_upload_ok() from public, anon;
revoke all on function public.list_members(text) from public, anon;
revoke all on function public.public_profile(uuid) from public;
revoke all on function public.staff_profiles() from public;
grant execute on function public.site_locked(), public.site_status() to anon, authenticated;
grant execute on function public.set_lockdown(boolean, text), public.set_member_badges(uuid, text[]) to authenticated;
grant execute on function public.report_upload_ok() to authenticated;
grant execute on function public.report_attachments_ok(jsonb) to anon, authenticated;
grant execute on function public.list_members(text) to authenticated;
grant execute on function public.public_profile(uuid), public.staff_profiles() to anon, authenticated;
