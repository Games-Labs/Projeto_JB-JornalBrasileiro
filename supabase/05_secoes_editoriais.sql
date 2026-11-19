-- =====================================================================
-- JB — Seções editoriais, autores, agendamento e versões (2026-11)
-- Para projetos criados com uma versão anterior do 01_schema.sql (rode depois do 04).
-- Instalação nova: o 01_schema.sql já contém tudo isto; NÃO rode este arquivo.
-- Pode ser rodado mais de uma vez (idempotente).
--
-- O que muda:
--   • news ganha tipo de conteúdo (notícia, reportagem, análise, opinião, editorial,
--     entrevista, verificação de fatos, ao vivo), veredito da checagem, cobertura em
--     andamento, fontes, correções, atualizações ao vivo, cronologia, personagens,
--     gráfico e data de atualização (definida só pelo banco).
--   • Agendamento: matéria "publicada" com data no futuro só fica pública quando a data chega.
--   • authors: jornalistas e colunistas (leitura pública, escrita só do editor).
--   • news_versions: versão anterior guardada automaticamente a cada edição do conteúdo.
-- =====================================================================

-- ---------- 1. Novas colunas em news ----------
alter table public.news add column if not exists kind        text not null default 'noticia';
alter table public.news add column if not exists verdict     text;
alter table public.news add column if not exists live        boolean not null default false;
alter table public.news add column if not exists sources     jsonb not null default '[]'::jsonb;
alter table public.news add column if not exists corrections jsonb not null default '[]'::jsonb;
alter table public.news add column if not exists updates     jsonb not null default '[]'::jsonb;
alter table public.news add column if not exists timeline    jsonb not null default '[]'::jsonb;
alter table public.news add column if not exists people      jsonb not null default '[]'::jsonb;
alter table public.news add column if not exists chart       jsonb;
alter table public.news add column if not exists updated_at  timestamptz;

alter table public.news drop constraint if exists news_kind_check;
alter table public.news add constraint news_kind_check check (kind in ('noticia','reportagem','analise','opiniao','editorial','entrevista','checagem','aovivo'));
alter table public.news drop constraint if exists news_verdict_check;
alter table public.news add constraint news_verdict_check check (verdict is null or verdict in ('verdadeiro','falso','impreciso','fora_de_contexto'));
alter table public.news drop constraint if exists news_extras_check;
alter table public.news add constraint news_extras_check check (
    jsonb_typeof(sources) = 'array' and pg_column_size(sources) <= 20000
    and jsonb_typeof(corrections) = 'array' and pg_column_size(corrections) <= 20000
    and jsonb_typeof(updates) = 'array' and pg_column_size(updates) <= 200000
    and jsonb_typeof(timeline) = 'array' and pg_column_size(timeline) <= 20000
    and jsonb_typeof(people) = 'array' and pg_column_size(people) <= 20000
    and (chart is null or (jsonb_typeof(chart) = 'object' and pg_column_size(chart) <= 10000)));

-- ---------- 2. Autores (jornalistas e colunistas) ----------
create table if not exists public.authors (
    id         uuid primary key default gen_random_uuid(),
    name       text not null unique check (char_length(trim(name)) between 1 and 120),
    role       text not null default 'Repórter' check (char_length(role) <= 80),
    bio        text not null default '' check (char_length(bio) <= 1000),
    avatar     text not null default '' check (char_length(avatar) <= 2000),   -- URL (Storage ou caminho local)
    columnist  boolean not null default false,
    created_at timestamptz not null default now()
);

-- ---------- 3. Versões das matérias ----------
create table if not exists public.news_versions (
    id          bigint generated always as identity primary key,
    news_id     uuid not null references public.news(id) on delete cascade,
    replaced_at timestamptz not null default now(),
    replaced_by text not null default '',
    snapshot    jsonb not null
);
create index if not exists news_versions_news_idx on public.news_versions (news_id, replaced_at desc);

-- Antes de cada edição: se o conteúdo mudou, guarda a versão anterior (mantém as 20 últimas)
-- e marca a data de atualização. Mudanças só de status/manchete não contam como edição.
create or replace function public.news_track_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict,
        new.sources, new.timeline, new.people, new.chart)
       is distinct from
       (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict,
        old.sources, old.timeline, old.people, old.chart) then
        insert into public.news_versions (news_id, replaced_by, snapshot)
        values (old.id,
                coalesce((select left(p.name, 120) from public.profiles p where p.id = auth.uid()), ''),
                jsonb_build_object('title', old.title, 'subtitle', old.subtitle, 'body', old.body, 'image', old.image,
                                   'author', old.author, 'category', old.category, 'kind', old.kind, 'verdict', old.verdict,
                                   'sources', old.sources, 'timeline', old.timeline, 'people', old.people, 'chart', old.chart));
        delete from public.news_versions
         where news_id = old.id
           and id not in (select id from public.news_versions where news_id = old.id order by replaced_at desc, id desc limit 20);
        new.updated_at := now();
    elsif (new.updates, new.corrections) is distinct from (old.updates, old.corrections) then
        new.updated_at := now();
    else
        new.updated_at := old.updated_at;   -- o cliente não define esta data
    end if;
    return new;
end;
$$;

drop trigger if exists news_track_changes on public.news;
create trigger news_track_changes
    before update on public.news
    for each row execute function public.news_track_changes();
revoke execute on function public.news_track_changes() from public, anon, authenticated;

-- Notícia nova nunca chega com data de atualização.
create or replace function public.news_clear_updated()
returns trigger
language plpgsql set search_path = public
as $$
begin
    new.updated_at := null;
    return new;
end;
$$;
drop trigger if exists news_clear_updated on public.news;
create trigger news_clear_updated
    before insert on public.news
    for each row execute function public.news_clear_updated();
revoke execute on function public.news_clear_updated() from public, anon, authenticated;

-- ---------- 4. Agendamento: público só vê o que já tem data de publicação no passado ----------
drop policy if exists "news: ler publicadas ou admin" on public.news;
create policy "news: ler publicadas ou admin" on public.news
    for select to anon, authenticated using ((status = 'publicada' and date <= now()) or (select public.is_admin()));

drop policy if exists "comments: ler" on public.comments;
create policy "comments: ler" on public.comments
    for select to anon, authenticated using (
        (select public.is_admin()) or exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
drop policy if exists "comments: criar" on public.comments;
create policy "comments: criar" on public.comments
    for insert to anon, authenticated with check (
        (user_id is null or user_id = (select auth.uid()))
        and exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));

create or replace function public.hit_news(p_id uuid)
returns void
language sql security definer set search_path = public
as $$
    insert into public.news_views (news_id, count)
    select id, 1 from public.news where id = p_id and status = 'publicada' and date <= now()
    on conflict (news_id) do update set count = public.news_views.count + 1;
$$;
grant execute on function public.hit_news(uuid) to anon, authenticated;

-- ---------- 5. RLS e privilégios das tabelas novas ----------
alter table public.authors       enable row level security;
alter table public.news_versions enable row level security;

drop policy if exists "authors: ler" on public.authors;
create policy "authors: ler" on public.authors
    for select to anon, authenticated using (true);
drop policy if exists "authors: admin cria" on public.authors;
create policy "authors: admin cria" on public.authors
    for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "authors: admin edita" on public.authors;
create policy "authors: admin edita" on public.authors
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "authors: admin exclui" on public.authors;
create policy "authors: admin exclui" on public.authors
    for delete to authenticated using ((select public.is_admin()));

drop policy if exists "versions: admin le" on public.news_versions;
create policy "versions: admin le" on public.news_versions
    for select to authenticated using ((select public.is_admin()));
drop policy if exists "versions: admin exclui" on public.news_versions;
create policy "versions: admin exclui" on public.news_versions
    for delete to authenticated using ((select public.is_admin()));

revoke all on public.authors, public.news_versions from anon, authenticated;
grant select                                                   on public.authors       to anon, authenticated;
grant insert (id, name, role, bio, avatar, columnist)          on public.authors       to authenticated;
grant update (name, role, bio, avatar, columnist)              on public.authors       to authenticated;
grant delete                                                   on public.authors       to authenticated;
grant select, delete                                           on public.news_versions to authenticated;
