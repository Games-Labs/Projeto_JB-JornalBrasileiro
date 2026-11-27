-- =====================================================================
-- JB — Divisões (JB Educa e cargo Professor), créditos de edição, catálogo de selos e tags,
-- seguir matérias, notificações (no site e push), visitas do site (2026-11)
-- Para projetos criados com uma versão anterior do 01_schema.sql (rode depois do 10).
-- Instalação nova: o 01_schema.sql já contém tudo isto; NÃO rode este arquivo.
-- Pode ser rodado mais de uma vez (idempotente).
--
-- 1. Divisões editoriais (tabela divisions + news.division): "jb" (o jornal) e "educa" (JB Educa).
--    Uma divisão nova = uma linha aqui + uma entrada em JB.DIVISIONS (assets/js/storage.js).
--    Matérias do Educa usam as disciplinas como editoria e os tipos "aula" e "exercicios".
-- 2. Cargo "professor": igual ao jornalista, mas só no JB Educa (cria e edita os próprios
--    materiais até "Aprovada"; quem publica é a coordenação). Usa MFA como o resto da equipe.
-- 3. Créditos de edição (news.edit_credits): nomes livres, equipes ou núcleos ("Edição: …"),
--    separados dos colaboradores com permissão de editar (news.editors).
-- 4. Catálogo de selos (badges: de perfil e/ou de matéria) e de tags (tags + news.tags),
--    geridos pela coordenação na página "Selos e tags" do painel.
-- 5. Seguir matérias (follows), notificações (notifications) e push (push_subscriptions).
--    Gatilhos avisam quem segue quando a matéria muda ou a cobertura ao vivo ganha atualização,
--    e os administradores em eventos de segurança (lockdown, cargos de coordenação).
--    O push sai pelo pg_net para a Function /api/push do site (ver docs/DEPLOY.md: segredos
--    jb_push_hook_url e jb_push_hook_secret no Vault + VAPID e PUSH_HOOK_SECRET no Cloudflare).
--    Sem esses segredos, as notificações continuam aparecendo no sino do site.
-- 6. Visitas do site por dia (site_visits + hit_site): páginas vistas sempre; visitantes só de
--    quem aceitou as estatísticas nos cookies. Nada identifica o visitante.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- ---------- 1. Divisões ----------
create table if not exists public.divisions (
    slug        text primary key check (slug ~ '^[a-z][a-z0-9-]{1,30}$'),
    name        text not null check (char_length(name) between 1 and 60),
    description text not null default '' check (char_length(description) <= 300),
    sort        int  not null default 0
);
insert into public.divisions (slug, name, description, sort) values
    ('jb', 'Jornal Brasileiro', 'Notícias, reportagens, análises e checagens.', 0),
    ('educa', 'JB Educa', 'Aulas, explicações e exercícios para estudantes.', 1)
on conflict (slug) do nothing;
alter table public.divisions enable row level security;
revoke all on public.divisions from anon, authenticated;
grant select on public.divisions to anon, authenticated;
drop policy if exists "divisions: ler" on public.divisions;
create policy "divisions: ler" on public.divisions for select to anon, authenticated using (true);

alter table public.news add column if not exists division text not null default 'jb';
alter table public.news drop constraint if exists news_division_fkey;
alter table public.news add constraint news_division_fkey foreign key (division) references public.divisions (slug) on update cascade;
create index if not exists news_division_idx on public.news (division);

-- Disciplinas do JB Educa entram como editorias; tipos novos: aula e lista de exercícios
alter table public.news drop constraint if exists news_category_check;
alter table public.news add constraint news_category_check check (category in (
    'politica', 'economia', 'esportes', 'investigacao', 'tecnologia', 'infraestrutura', 'brasil', 'mundo', 'educacao', 'saude', 'meioambiente', 'cultura',
    'matematica', 'portugues', 'ciencias', 'historia', 'geografia', 'ingles', 'redacao'));
alter table public.news drop constraint if exists news_kind_check;
alter table public.news add constraint news_kind_check check (kind in (
    'noticia', 'reportagem', 'analise', 'opiniao', 'editorial', 'entrevista', 'checagem', 'aovivo', 'aula', 'exercicios'));

-- ---------- 2. Cargo professor ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'coordenador', 'jornalista', 'professor', 'leitor'));

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin', 'coordenador', 'jornalista', 'professor'), false) $$;

-- Jornalista: qualquer divisão. Professor: só o JB Educa. Os dois param em "Aprovada".
drop policy if exists "news: equipe cria" on public.news;
create policy "news: equipe cria" on public.news
    for insert to authenticated with check (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista' and created_by = (select auth.uid())
            and status in ('rascunho', 'revisao', 'aprovada'))
        or ((select public.my_role()) = 'professor' and created_by = (select auth.uid())
            and status in ('rascunho', 'revisao', 'aprovada') and division = 'educa'));

drop policy if exists "news: equipe edita" on public.news;
create policy "news: equipe edita" on public.news
    for update to authenticated
    using (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista'
            and (created_by = (select auth.uid()) or (select auth.uid()) = any (editors))
            and status in ('rascunho', 'revisao', 'aprovada'))
        or ((select public.my_role()) = 'professor'
            and (created_by = (select auth.uid()) or (select auth.uid()) = any (editors))
            and status in ('rascunho', 'revisao', 'aprovada') and division = 'educa'))
    with check (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista'
            and (created_by = (select auth.uid()) or (select auth.uid()) = any (editors))
            and status in ('rascunho', 'revisao', 'aprovada'))
        or ((select public.my_role()) = 'professor'
            and (created_by = (select auth.uid()) or (select auth.uid()) = any (editors))
            and status in ('rascunho', 'revisao', 'aprovada') and division = 'educa'));

-- ---------- 5a. Notificações (antes das funções de cargo, que avisam os administradores) ----------
create table if not exists public.notifications (
    id         bigint generated always as identity primary key,
    user_id    uuid not null references auth.users (id) on delete cascade,
    kind       text not null check (kind in ('follow', 'live', 'security')),
    title      text not null check (char_length(title) <= 200),
    body       text not null default '' check (char_length(body) <= 500),
    url        text not null default '' check (url ~ '^(pages/[a-z0-9-]+\.html(\?[A-Za-z0-9=&%._-]{0,200})?)?$'),
    news_id    uuid references public.news (id) on delete cascade,
    created_at timestamptz not null default now(),
    read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_news_idx on public.notifications (news_id);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists "notifications: dono le" on public.notifications;
create policy "notifications: dono le" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notifications: dono marca" on public.notifications;
create policy "notifications: dono marca" on public.notifications for update to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "notifications: dono apaga" on public.notifications;
create policy "notifications: dono apaga" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- Aparelhos inscritos para receber push. Só serviços de push conhecidos (o site manda os avisos
-- para estes endereços). Gravado só pelas funções push_subscribe/push_unsubscribe.
create table if not exists public.push_subscriptions (
    endpoint   text primary key check (char_length(endpoint) <= 1000 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)/'),
    user_id    uuid not null references auth.users (id) on delete cascade,
    p256dh     text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
    auth       text not null check (auth ~ '^[A-Za-z0-9_-]{16,30}={0,2}$'),
    created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select (endpoint, created_at) on public.push_subscriptions to authenticated;
drop policy if exists "push: dono le" on public.push_subscriptions;
create policy "push: dono le" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));

-- Envia o push (assíncrono, pelo pg_net) para a Function /api/push do site, que criptografa e
-- entrega a cada aparelho. Sem pg_net ou sem os segredos no Vault, não faz nada.
create or replace function public.push_dispatch(p_users uuid[], p_title text, p_body text, p_url text, p_tag text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
    hook   text;
    secret text;
    subs   jsonb;
begin
    if p_users is null or cardinality(p_users) = 0 or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
        return;
    end if;
    select s.decrypted_secret into hook from vault.decrypted_secrets s where s.name = 'jb_push_hook_url';
    select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'jb_push_hook_secret';
    if hook is null or secret is null or hook !~ '^https://' then
        return;
    end if;
    for subs in
        select jsonb_agg(jsonb_build_object('endpoint', z.endpoint, 'p256dh', z.p256dh, 'auth', z.auth))
          from (select ps.*, (row_number() over (order by ps.endpoint) - 1) / 40 as grp   -- 40 por chamada (limite da Function)
                  from public.push_subscriptions ps where ps.user_id = any (p_users)) z
         group by z.grp
    loop
        perform net.http_post(
            url := hook,
            body := jsonb_build_object('subs', subs, 'title', left(coalesce(p_title, ''), 200), 'body', left(coalesce(p_body, ''), 300),
                                       'url', coalesce(p_url, ''), 'tag', left(coalesce(p_tag, ''), 80)),
            params := '{}'::jsonb,
            headers := jsonb_build_object('Content-Type', 'application/json', 'X-JB-Hook', secret),
            timeout_milliseconds := 8000);
    end loop;
exception when others then
    raise warning 'JB push_dispatch: %', sqlerrm;   -- o aviso no sino do site continua valendo
end;
$$;

-- Cria (ou agrupa) a notificação de cada conta e manda o push. Mesma matéria e mesmo tipo, ainda
-- não lida, nos últimos 15 minutos: atualiza a existente em vez de empilhar outra. 100 por conta.
create or replace function public.notify_users(p_users uuid[], p_kind text, p_title text, p_body text, p_url text, p_news uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare users uuid[];
begin
    select coalesce(array_agg(distinct u), '{}') into users from unnest(p_users) u where u is not null;
    if cardinality(users) = 0 then
        return;
    end if;
    if p_news is not null then
        update public.notifications n
           set title = left(p_title, 200), body = left(coalesce(p_body, ''), 500), created_at = now()
         where n.user_id = any (users) and n.news_id = p_news and n.kind = p_kind and n.read_at is null
           and n.created_at > now() - interval '15 minutes';
    end if;
    insert into public.notifications (user_id, kind, title, body, url, news_id)
    select u, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 500), coalesce(p_url, ''), p_news
      from unnest(users) u
     where p_news is null
        or not exists (select 1 from public.notifications n where n.user_id = u and n.news_id = p_news and n.kind = p_kind
                          and n.read_at is null and n.created_at > now() - interval '15 minutes');
    delete from public.notifications d
     where d.id in (select z.id from (select n.id, row_number() over (partition by n.user_id order by n.created_at desc, n.id desc) rn
                                        from public.notifications n where n.user_id = any (users)) z
                     where z.rn > 100);
    perform public.push_dispatch(users, p_title, p_body, p_url, p_kind || '-' || coalesce(p_news::text, 'jb'));
end;
$$;

-- Administradores (menos quem fez a ação) recebem os avisos de segurança
create or replace function public.notify_admins(p_title text, p_body text, p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
    perform public.notify_users((select array_agg(p.id) from public.profiles p where p.role = 'admin' and p.id is distinct from auth.uid()),
                                'security', p_title, p_body, p_url, null);
end;
$$;

-- ---------- 2b. Cargos e selos com o professor ----------
create or replace function public.set_member_role(p_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
    me  text := public.my_role();
    cur text;
    who text;
    tgt text;
begin
    if auth.uid() is null or me is null or me not in ('admin', 'coordenador') then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    if p_id = auth.uid() then
        raise exception 'não é possível alterar o próprio cargo' using errcode = '42501';
    end if;
    if p_role is null or p_role not in ('leitor', 'jornalista', 'professor', 'coordenador') then
        raise exception 'cargo inválido' using errcode = '22023';
    end if;
    select role, name into cur, tgt from public.profiles where id = p_id for update;
    if cur is null then
        raise exception 'conta não encontrada' using errcode = 'P0002';
    end if;
    if cur = 'admin' then
        raise exception 'administradores só podem ser alterados pelo SQL Editor' using errcode = '42501';
    end if;
    if me = 'coordenador' and (cur not in ('leitor', 'jornalista', 'professor') or p_role not in ('leitor', 'jornalista', 'professor')) then
        raise exception 'coordenadores só colocam ou tiram jornalistas e professores' using errcode = '42501';
    end if;
    if cur = p_role then
        return;
    end if;
    update public.profiles set role = p_role where id = p_id;
    who := coalesce((select b.name from public.profiles b where b.id = auth.uid()), '');
    insert into public.role_changes (target_id, target_name, old_role, new_role, changed_by, changed_by_name)
    values (p_id, tgt, cur, p_role, auth.uid(), who);
    -- Coordenação muda: aviso de segurança para os administradores
    if cur = 'coordenador' or p_role = 'coordenador' then
        perform public.notify_admins('Mudança na coordenação',
            left(tgt, 80) || ': ' || cur || ' → ' || p_role || ' (por ' || left(who, 80) || ')', 'pages/admin-equipe.html');
    end if;
end;
$$;

-- ---------- 4. Catálogo de selos e tags ----------
create table if not exists public.badges (
    slug         text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 30),
    label        text not null check (char_length(trim(label)) between 1 and 40),
    description  text not null default '' check (char_length(description) <= 200),
    color        text not null default 'accent' check (color in ('accent', 'blue', 'green', 'orange', 'purple', 'gray')),
    for_profiles boolean not null default true,
    for_news     boolean not null default false,
    active       boolean not null default true,
    sort         int not null default 0,
    created_at   timestamptz not null default now()
);
insert into public.badges (slug, label, description, color, for_profiles, for_news, sort) values
    ('colaborador', 'Colaborador', 'Colabora com conteúdo, informações ou pautas para o JB.', 'accent', true, false, 1),
    ('apoiador', 'Apoiador Oficial', 'Apoia oficialmente o projeto do Jornal Brasileiro.', 'accent', true, false, 2),
    ('ajudante', 'Ajudante do Jornal', 'Ajuda a redação no dia a dia do jornal.', 'accent', true, false, 3),
    ('reporter', 'Repórter', 'Repórter que contribui com o JB.', 'accent', true, false, 4),
    ('exclusivo', 'Exclusivo', 'Informação apurada e publicada primeiro pelo JB.', 'accent', false, true, 10),
    ('especial', 'Especial', 'Reportagem especial, com apuração aprofundada.', 'purple', false, true, 11),
    ('dados-abertos', 'Dados abertos', 'Matéria construída a partir de dados públicos, com as fontes indicadas.', 'blue', false, true, 12)
on conflict (slug) do nothing;
alter table public.badges enable row level security;
revoke all on public.badges from anon, authenticated;
grant select on public.badges to anon, authenticated;
grant insert (slug, label, description, color, for_profiles, for_news, active, sort) on public.badges to authenticated;
grant update (label, description, color, for_profiles, for_news, active, sort) on public.badges to authenticated;
grant delete on public.badges to authenticated;
drop policy if exists "badges: ler" on public.badges;
create policy "badges: ler" on public.badges for select to anon, authenticated using (true);
drop policy if exists "badges: editor cria" on public.badges;
create policy "badges: editor cria" on public.badges for insert to authenticated with check ((select public.is_editor()));
drop policy if exists "badges: editor edita" on public.badges;
create policy "badges: editor edita" on public.badges for update to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
drop policy if exists "badges: editor exclui" on public.badges;
create policy "badges: editor exclui" on public.badges for delete to authenticated using ((select public.is_editor()));

create table if not exists public.tags (
    slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
    name        text not null check (char_length(trim(name)) between 1 and 60),
    description text not null default '' check (char_length(description) <= 300),
    created_at  timestamptz not null default now()
);
alter table public.tags enable row level security;
revoke all on public.tags from anon, authenticated;
grant select on public.tags to anon, authenticated;
grant insert (slug, name, description) on public.tags to authenticated;
grant update (name, description) on public.tags to authenticated;
grant delete on public.tags to authenticated;
drop policy if exists "tags: ler" on public.tags;
create policy "tags: ler" on public.tags for select to anon, authenticated using (true);
-- Qualquer pessoa da equipe cria uma tag ao escrever; editar e excluir é da coordenação
drop policy if exists "tags: equipe cria" on public.tags;
create policy "tags: equipe cria" on public.tags for insert to authenticated with check ((select public.is_staff()));
drop policy if exists "tags: editor edita" on public.tags;
create policy "tags: editor edita" on public.tags for update to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
drop policy if exists "tags: editor exclui" on public.tags;
create policy "tags: editor exclui" on public.tags for delete to authenticated using ((select public.is_editor()));

-- Selos de perfil passam a vir do catálogo (antes: lista fixa)
alter table public.profiles drop constraint if exists profiles_badges_check;
alter table public.profiles add constraint profiles_badges_check check (cardinality(badges) <= 8 and array_position(badges, null) is null);

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
    if exists (select 1 from unnest(nb) b where not exists (select 1 from public.badges g where g.slug = b and g.for_profiles and g.active))
       or cardinality(nb) > 8 then
        raise exception 'selo inválido' using errcode = '22023';
    end if;
    select role into cur from public.profiles where id = p_id for update;
    if cur is null then
        raise exception 'conta não encontrada' using errcode = 'P0002';
    end if;
    if cur = 'admin' then
        raise exception 'administradores só podem ser alterados pelo SQL Editor' using errcode = '42501';
    end if;
    if me = 'coordenador' and cur not in ('leitor', 'jornalista', 'professor') then
        raise exception 'coordenadores só dão selos a leitores, jornalistas e professores' using errcode = '42501';
    end if;
    update public.profiles set badges = nb where id = p_id;
end;
$$;

-- ---------- 3. Créditos, tags e selos nas matérias ----------
alter table public.news add column if not exists edit_credits text[] not null default '{}';
alter table public.news add column if not exists tags text[] not null default '{}';
alter table public.news add column if not exists badges text[] not null default '{}';
alter table public.news drop constraint if exists news_edit_credits_check;
alter table public.news add constraint news_edit_credits_check
    check (cardinality(edit_credits) <= 10 and array_position(edit_credits, null) is null and char_length(array_to_string(edit_credits, '')) <= 1200);
alter table public.news drop constraint if exists news_tags_check;
alter table public.news add constraint news_tags_check check (cardinality(tags) <= 10 and array_position(tags, null) is null);
alter table public.news drop constraint if exists news_badges_check;
alter table public.news add constraint news_badges_check check (cardinality(badges) <= 3 and array_position(badges, null) is null);
create index if not exists news_tags_idx on public.news using gin (tags);
grant insert (division, edit_credits, tags, badges) on public.news to authenticated;
grant update (division, edit_credits, tags, badges) on public.news to authenticated;

-- Tags e selos inexistentes (ou selo que não vale para matérias) são descartados ao salvar
create or replace function public.news_clean_labels()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if tg_op = 'INSERT' or new.tags is distinct from old.tags then
        new.tags := coalesce((select array_agg(z.t order by z.o) from (select u.t, min(u.o) o from unnest(new.tags) with ordinality u(t, o)
                                where exists (select 1 from public.tags g where g.slug = u.t) group by u.t) z), '{}');
    end if;
    if tg_op = 'INSERT' or new.badges is distinct from old.badges then
        new.badges := coalesce((select array_agg(z.t order by z.o) from (select u.t, min(u.o) o from unnest(new.badges) with ordinality u(t, o)
                                  where exists (select 1 from public.badges g where g.slug = u.t and g.for_news and g.active) group by u.t) z), '{}');
    end if;
    return new;
end;
$$;
drop trigger if exists news_clean_labels on public.news;
create trigger news_clean_labels before insert or update on public.news
    for each row execute function public.news_clean_labels();

-- Tag ou selo excluído sai das matérias e dos perfis
create or replace function public.labels_cleanup()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if tg_table_name = 'tags' then
        update public.news set tags = array_remove(tags, old.slug) where old.slug = any (tags);
    else
        update public.news set badges = array_remove(badges, old.slug) where old.slug = any (badges);
        update public.profiles set badges = array_remove(badges, old.slug) where old.slug = any (badges);
    end if;
    return null;
end;
$$;
drop trigger if exists tags_cleanup on public.tags;
create trigger tags_cleanup after delete on public.tags for each row execute function public.labels_cleanup();
drop trigger if exists badges_cleanup on public.badges;
create trigger badges_cleanup after delete on public.badges for each row execute function public.labels_cleanup();

-- Catálogo de selos e tags na auditoria
create or replace function public.audit_labels()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare r jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
    perform public.audit((case when tg_table_name = 'tags' then 'tag.' else 'badge.' end) ||
                         (case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'edit' else 'delete' end),
                         tg_table_name, r ->> 'slug', coalesce(r ->> 'name', r ->> 'label', ''), '{}'::jsonb);
    return null;
end;
$$;
drop trigger if exists audit_tags on public.tags;
create trigger audit_tags after insert or update or delete on public.tags for each row execute function public.audit_labels();
drop trigger if exists audit_badges on public.badges;
create trigger audit_badges after insert or update or delete on public.badges for each row execute function public.audit_labels();

-- Créditos de edição entram no histórico de versões
create or replace function public.news_track_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict,
        new.sources, new.timeline, new.people, new.chart, new.video, new.coauthors, new.edit_credits)
       is distinct from
       (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict,
        old.sources, old.timeline, old.people, old.chart, old.video, old.coauthors, old.edit_credits) then
        insert into public.news_versions (news_id, replaced_by, snapshot)
        values (old.id,
                coalesce((select left(p.name, 120) from public.profiles p where p.id = auth.uid()), ''),
                jsonb_build_object('title', old.title, 'subtitle', old.subtitle, 'body', old.body, 'image', old.image,
                                   'author', old.author, 'category', old.category, 'kind', old.kind, 'verdict', old.verdict,
                                   'sources', old.sources, 'timeline', old.timeline, 'people', old.people, 'chart', old.chart,
                                   'video', old.video, 'coauthors', to_jsonb(old.coauthors), 'edit_credits', to_jsonb(old.edit_credits)));
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
        perform public.audit('news.create', 'news', new.id::text, new.title, jsonb_build_object('status', new.status, 'kind', new.kind, 'division', new.division));
    elsif tg_op = 'DELETE' then
        perform public.audit('news.delete', 'news', old.id::text, old.title, jsonb_build_object('status', old.status));
    else
        if new.status is distinct from old.status then
            perform public.audit('news.status', 'news', new.id::text, new.title, jsonb_build_object('from', old.status, 'to', new.status));
        end if;
        if (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict, new.sources, new.timeline, new.people,
            new.chart, new.corrections, new.video, new.coauthors, new.edit_credits, new.division)
           is distinct from
           (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict, old.sources, old.timeline, old.people,
            old.chart, old.corrections, old.video, old.coauthors, old.edit_credits, old.division) then
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

-- ---------- 5b. Seguir matérias e avisos de atualização ----------
create table if not exists public.follows (
    user_id    uuid not null references auth.users (id) on delete cascade,
    news_id    uuid not null references public.news (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, news_id)
);
create index if not exists follows_news_idx on public.follows (news_id);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
grant select, delete on public.follows to authenticated;
grant insert (user_id, news_id) on public.follows to authenticated;
drop policy if exists "follows: dono" on public.follows;
create policy "follows: dono" on public.follows for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()) and exists (select 1 from public.news n where n.id = news_id));
-- Até 500 matérias seguidas por conta (num gatilho: contar na política faria a política ler a própria tabela)
create or replace function public.follows_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if (select count(*) from public.follows f where f.user_id = new.user_id) >= 500 then
        raise exception 'limite de matérias seguidas' using errcode = '54000';
    end if;
    return new;
end;
$$;
drop trigger if exists follows_limit on public.follows;
create trigger follows_limit before insert on public.follows for each row execute function public.follows_limit();
drop policy if exists "follows: conta liberada grava" on public.follows;
create policy "follows: conta liberada grava" on public.follows as restrictive for insert to authenticated with check ((select public.account_ok()));
drop policy if exists "lockdown: follows" on public.follows;
create policy "lockdown: follows" on public.follows as restrictive for all to authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));

-- Avisar de TODAS as coberturas ao vivo (opção na Minha Central)
alter table public.profiles add column if not exists notify_live boolean not null default false;
grant update (notify_live) on public.profiles to authenticated;

-- Matéria publicada mudou: avisa quem segue (e, no ao vivo, quem pediu todas as coberturas)
create or replace function public.news_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
    users uuid[];
    k     text;
    t     text;
    b     text;
    up    jsonb;
begin
    if new.status <> 'publicada' or new.date > now() or old.status <> 'publicada' or old.date > now() or public.site_locked() then
        return null;
    end if;
    if jsonb_array_length(new.updates) > jsonb_array_length(old.updates) then
        select u into up from jsonb_array_elements(new.updates) u order by u ->> 'date' desc nulls last limit 1;
        k := 'live';
        t := 'Ao vivo: ' || left(new.title, 180);
        b := left(coalesce(up ->> 'text', 'Nova atualização na cobertura.'), 300);
        select array_agg(distinct x) into users from (
            select f.user_id x from public.follows f where f.news_id = new.id
            union
            select p.id from public.profiles p where new.kind = 'aovivo' and p.notify_live) s
         where x is distinct from auth.uid();
    elsif (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict, new.sources, new.timeline,
           new.people, new.chart, new.video, new.coauthors, new.edit_credits, new.corrections)
          is distinct from
          (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict, old.sources, old.timeline,
           old.people, old.chart, old.video, old.coauthors, old.edit_credits, old.corrections) then
        k := 'follow';
        t := 'Atualizada: ' || left(new.title, 180);
        b := case when jsonb_array_length(new.corrections) > jsonb_array_length(old.corrections)
                  then 'Uma correção foi publicada na matéria que você segue.'
                  else 'A matéria que você segue foi atualizada.' end;
        select array_agg(f.user_id) into users from public.follows f where f.news_id = new.id and f.user_id is distinct from auth.uid();
    else
        return null;
    end if;
    if users is not null then
        perform public.notify_users(users, k, t, b, 'pages/noticia.html?id=' || new.id::text, new.id);
    end if;
    return null;
end;
$$;
drop trigger if exists news_notify on public.news;
create trigger news_notify after update on public.news for each row execute function public.news_notify();

-- Lockdown: além da auditoria, aviso para os administradores
create or replace function public.set_lockdown(p_on boolean, p_message text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
    msg text := left(coalesce(trim(p_message), ''), 500);
    who text := coalesce((select p.name from public.profiles p where p.id = auth.uid()), '');
begin
    if not public.is_editor() then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    update public.site_settings
       set lockdown = coalesce(p_on, false), lockdown_message = msg, changed_at = now(), changed_by_name = who
     where id = 1;
    perform public.audit(case when coalesce(p_on, false) then 'site.lockdown_on' else 'site.lockdown_off' end,
                         'site', '1', 'Modo lockdown', jsonb_build_object('message', left(msg, 200)));
    perform public.notify_admins(case when coalesce(p_on, false) then 'Modo lockdown LIGADO' else 'Modo lockdown desligado' end,
                                 'Por ' || left(who, 80) || case when coalesce(p_on, false) and msg <> '' then ': ' || left(msg, 200) else '.' end,
                                 'pages/admin-seguranca.html');
end;
$$;

-- Push: inscrever e cancelar este aparelho (a conta precisa estar liberada). Até 10 aparelhos.
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
    if auth.uid() is null or not public.account_ok() then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
    values (p_endpoint, auth.uid(), p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
    delete from public.push_subscriptions d
     where d.user_id = auth.uid()
       and d.endpoint not in (select s.endpoint from public.push_subscriptions s where s.user_id = auth.uid() order by s.created_at desc limit 10);
end;
$$;
create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language sql security definer set search_path = public
as $$ delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid(); $$;

-- Chamada pela Function /api/push (com o mesmo segredo do Vault): apaga aparelhos que o serviço
-- de push diz que não existem mais (resposta 404/410).
create or replace function public.push_gone(p_secret text, p_endpoints text[])
returns int
language plpgsql security definer set search_path = public
as $$
declare
    s text;
    n int;
begin
    select v.decrypted_secret into s from vault.decrypted_secrets v where v.name = 'jb_push_hook_secret';
    if s is null or p_secret is null or p_secret <> s then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    delete from public.push_subscriptions where endpoint = any (coalesce(p_endpoints, '{}'));
    get diagnostics n = row_count;
    return n;
end;
$$;

-- ---------- 6. Visitas do site ----------
create table if not exists public.site_visits (
    day      date primary key,
    views    int not null default 0 check (views >= 0),
    visitors int not null default 0 check (visitors >= 0)
);
alter table public.site_visits enable row level security;
revoke all on public.site_visits from anon, authenticated;
grant select on public.site_visits to authenticated;
drop policy if exists "visits: equipe le" on public.site_visits;
create policy "visits: equipe le" on public.site_visits for select to authenticated using ((select public.is_staff()));

-- p_new: primeira visita do dia neste navegador (só quem aceitou as estatísticas manda true)
create or replace function public.hit_site(p_new boolean default false)
returns void
language sql security definer set search_path = public
as $$
    insert into public.site_visits (day, views, visitors)
    select (now() at time zone 'America/Sao_Paulo')::date, 1, case when coalesce(p_new, false) then 1 else 0 end
     where not public.site_locked()
    on conflict (day) do update set views = public.site_visits.views + 1, visitors = public.site_visits.visitors + excluded.visitors;
$$;

-- ---------- Perfis públicos, equipe e Segurança com o professor ----------
create or replace function public.staff_profiles()
returns table (id uuid, name text, role text, bio text, avatar text, created_at timestamptz, badges text[])
language sql stable security definer set search_path = public
as $$
    select p.id, p.name, p.role, p.bio, p.avatar, p.created_at, p.badges
      from public.profiles p
     where (p.role in ('admin', 'coordenador', 'jornalista', 'professor') or cardinality(p.badges) > 0)
       and (not public.site_locked() or public.is_staff())
     order by case p.role when 'admin' then 0 when 'coordenador' then 1 when 'jornalista' then 2 when 'professor' then 3 else 4 end, p.name;
$$;

create or replace function public.list_members(p_query text default '')
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
         order by case p.role when 'admin' then 0 when 'coordenador' then 1 when 'jornalista' then 2 when 'professor' then 3 else 4 end,
                  cardinality(p.badges) desc, p.name
         limit 200;
end;
$$;

create or replace function public.security_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
    if not public.is_editor() then
        raise exception 'sem permissão' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'accounts', (select count(*) from public.profiles),
        'age_pending', (select count(*) from public.profiles where age_verified_at is null),
        'with_mfa', (select count(distinct user_id) from auth.mfa_factors where status = 'verified'),
        'staff', coalesce((select jsonb_agg(jsonb_build_object(
                'id', p.id, 'name', p.name, 'role', p.role,
                'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
                'age_ok', p.age_verified_at is not null,
                'last_sign_in', u.last_sign_in_at)
                order by case p.role when 'admin' then 0 when 'coordenador' then 1 when 'jornalista' then 2 else 3 end, p.name)
            from public.profiles p join auth.users u on u.id = p.id
            where p.role in ('admin', 'coordenador', 'jornalista', 'professor')), '[]'::jsonb),
        'audit_24h', (select count(*) from public.audit_log where at > now() - interval '24 hours'),
        'push_devices', (select count(*) from public.push_subscriptions),
        'push_ready', exists (select 1 from vault.decrypted_secrets v where v.name = 'jb_push_hook_secret')
                      and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null);
end;
$$;

-- ---------- Privilégios das funções ----------
revoke all on function public.push_dispatch(uuid[], text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_users(uuid[], text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.notify_admins(text, text, text) from public, anon, authenticated;
revoke all on function public.news_clean_labels() from public, anon, authenticated;
revoke all on function public.labels_cleanup() from public, anon, authenticated;
revoke all on function public.audit_labels() from public, anon, authenticated;
revoke all on function public.news_notify() from public, anon, authenticated;
revoke all on function public.follows_limit() from public, anon, authenticated;
revoke all on function public.push_subscribe(text, text, text) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
revoke all on function public.push_gone(text, text[]) from public;
revoke all on function public.hit_site(boolean) from public;
revoke all on function public.set_member_role(uuid, text) from public, anon;
revoke all on function public.set_member_badges(uuid, text[]) from public, anon;
revoke all on function public.set_lockdown(boolean, text) from public, anon;
revoke all on function public.staff_profiles() from public;
revoke all on function public.list_members(text) from public, anon;
revoke all on function public.security_overview() from public, anon;
grant execute on function public.push_subscribe(text, text, text), public.push_unsubscribe(text) to authenticated;
grant execute on function public.push_gone(text, text[]) to anon, authenticated;
grant execute on function public.hit_site(boolean) to anon, authenticated;
grant execute on function public.set_member_role(uuid, text), public.set_member_badges(uuid, text[]), public.set_lockdown(boolean, text) to authenticated;
grant execute on function public.staff_profiles() to anon, authenticated;
grant execute on function public.list_members(text), public.security_overview() to authenticated;

-- ---------- Push: segredos no Vault (uma vez, no SQL Editor; NÃO deixe os valores em arquivo) ----------
-- select vault.create_secret('https://SEU-SITE.pages.dev/api/push', 'jb_push_hook_url');
-- select vault.create_secret('<o mesmo valor de PUSH_HOOK_SECRET no Cloudflare>', 'jb_push_hook_secret');
