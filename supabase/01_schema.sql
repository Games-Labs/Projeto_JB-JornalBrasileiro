-- =====================================================================
-- JB — Schema do Supabase (tabelas, RLS, funções)
-- Rode UMA vez no painel: SQL Editor > New query > cole tudo > Run.
-- É seguro rodar de novo em um projeto vazio; em projeto já usado,
-- apague as tabelas antes (veja docs/DEPLOY.md).
-- =====================================================================

-- ---------- Perfis (1:1 com auth.users) ----------
create table public.profiles (
    id         uuid primary key references auth.users(id) on delete cascade,
    name       text not null check (char_length(name) between 1 and 120),
    role       text not null default 'leitor' check (role in ('admin', 'leitor')),
    bio        text not null default '' check (char_length(bio) <= 1000),
    city       text not null default '' check (char_length(city) <= 120),
    interests  text[] not null default '{}' check (cardinality(interests) <= 20),
    avatar     text not null default '' check (char_length(avatar) <= 300000),
    created_at timestamptz not null default now()
);

-- Função usada pelas políticas. SECURITY DEFINER evita recursão de RLS em profiles.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Cria o perfil automaticamente quando alguém se cadastra (role sempre 'leitor').
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    insert into public.profiles (id, name)
    values (
        new.id,
        left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 120)
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Impede que um usuário comum se promova a admin pela API.
-- (Pelo SQL Editor auth.uid() é nulo, então você consegue promover um admin lá.)
create or replace function public.protect_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
        new.role := old.role;
    end if;
    return new;
end;
$$;

create trigger profiles_protect_role
    before update on public.profiles
    for each row execute function public.protect_profile_role();

-- ---------- Notícias ----------
create table public.news (
    id        uuid primary key default gen_random_uuid(),
    category  text not null check (category in (
                  'politica','economia','esportes','investigacao','tecnologia','infraestrutura',
                  'brasil','mundo','educacao','saude','meioambiente','cultura')),
    title     text not null check (char_length(title) between 1 and 300),
    subtitle  text not null default '' check (char_length(subtitle) <= 600),
    image     text not null default '' check (char_length(image) <= 1500000),  -- caminho local, URL ou data URL
    author    text not null default 'Redação JB' check (char_length(author) <= 120),
    body      jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array'),  -- lista de parágrafos
    status    text not null default 'rascunho' check (status in ('rascunho','revisao','aprovada','publicada','arquivada')),
    featured  boolean not null default false,
    date      timestamptz not null default now(),   -- data de publicação; no futuro = agendada
    -- Tipo de conteúdo: separa notícia, reportagem, análise, opinião etc.
    kind        text not null default 'noticia' check (kind in ('noticia','reportagem','analise','opiniao','editorial','entrevista','checagem','aovivo')),
    verdict     text check (verdict is null or verdict in ('verdadeiro','falso','impreciso','fora_de_contexto')),  -- verificação de fatos
    live        boolean not null default false,             -- cobertura ao vivo ainda em andamento
    sources     jsonb not null default '[]'::jsonb,         -- [{label, url}] fontes e referências
    corrections jsonb not null default '[]'::jsonb,         -- [{date, text}] correções editoriais
    updates     jsonb not null default '[]'::jsonb,         -- [{date, text, author}] atualizações ao vivo
    timeline    jsonb not null default '[]'::jsonb,         -- [{when, text}] cronologia (investigações)
    people      jsonb not null default '[]'::jsonb,         -- [{name, role}] personagens envolvidos
    chart       jsonb,                                      -- {title, unit, source, items:[{label, value}]}
    updated_at  timestamptz,                                -- definida só pelo banco (gatilho)
    constraint news_extras_check check (
        jsonb_typeof(sources) = 'array' and pg_column_size(sources) <= 20000
        and jsonb_typeof(corrections) = 'array' and pg_column_size(corrections) <= 20000
        and jsonb_typeof(updates) = 'array' and pg_column_size(updates) <= 200000
        and jsonb_typeof(timeline) = 'array' and pg_column_size(timeline) <= 20000
        and jsonb_typeof(people) = 'array' and pg_column_size(people) <= 20000
        and (chart is null or (jsonb_typeof(chart) = 'object' and pg_column_size(chart) <= 10000)))
);
create index news_status_date_idx on public.news (status, date desc);

-- ---------- Autores (jornalistas e colunistas) ----------
create table public.authors (
    id         uuid primary key default gen_random_uuid(),
    name       text not null unique check (char_length(trim(name)) between 1 and 120),
    role       text not null default 'Repórter' check (char_length(role) <= 80),
    bio        text not null default '' check (char_length(bio) <= 1000),
    avatar     text not null default '' check (char_length(avatar) <= 2000),   -- URL (Storage ou caminho local)
    columnist  boolean not null default false,
    created_at timestamptz not null default now()
);

-- ---------- Versões das matérias ----------
create table public.news_versions (
    id          bigint generated always as identity primary key,
    news_id     uuid not null references public.news(id) on delete cascade,
    replaced_at timestamptz not null default now(),
    replaced_by text not null default '',
    snapshot    jsonb not null
);
create index news_versions_news_idx on public.news_versions (news_id, replaced_at desc);

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

create trigger news_track_changes
    before update on public.news
    for each row execute function public.news_track_changes();

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
create trigger news_clear_updated
    before insert on public.news
    for each row execute function public.news_clear_updated();

-- ---------- Comentários ----------
create table public.comments (
    id      uuid primary key default gen_random_uuid(),
    news_id uuid not null references public.news(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    name    text not null check (char_length(trim(name)) between 1 and 80),
    text    text not null check (char_length(trim(text)) between 1 and 2000),
    date    timestamptz not null default now()
);
create index comments_news_idx on public.comments (news_id, date desc);
create index comments_user_idx on public.comments (user_id);

-- Comentário de usuário logado sempre fica no nome e na autoria da própria conta.
create or replace function public.comments_set_author()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if auth.uid() is not null then
        new.user_id := auth.uid();
        new.name := coalesce((select left(p.name, 80) from public.profiles p where p.id = auth.uid()), new.name);
    end if;
    return new;
end;
$$;

create trigger comments_set_author
    before insert on public.comments
    for each row execute function public.comments_set_author();

-- ---------- Denúncias / pautas ----------
create table public.reports (
    id         uuid primary key default gen_random_uuid(),
    subject    text not null check (char_length(trim(subject)) between 1 and 200),
    story      text not null check (char_length(trim(story)) between 1 and 8000),
    anonymous  boolean not null default false,
    name       text not null default '' check (char_length(name) <= 120),
    email      text not null default '' check (char_length(email) <= 200),
    attachment jsonb check (attachment is null or (jsonb_typeof(attachment) = 'object' and pg_column_size(attachment) <= 1024)),  -- só metadados {name,size}
    date       timestamptz not null default now()
);

-- ---------- Newsletter ----------
create table public.newsletter (
    email      text primary key check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    created_at timestamptz not null default now()
);

-- ---------- Visualizações (ranking "Mais lidas") ----------
create table public.news_views (
    news_id uuid primary key references public.news(id) on delete cascade,
    count   bigint not null default 0
);

-- ---------- Favoritos (só usuários logados) ----------
create table public.favorites (
    user_id    uuid not null references auth.users(id) on delete cascade,
    news_id    uuid not null references public.news(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, news_id)
);
create index favorites_news_idx on public.favorites (news_id);

-- ---------- Funções chamadas pelo site ----------
-- Conta uma leitura (somente de matéria publicada). Visitantes não escrevem direto na tabela.
create or replace function public.hit_news(p_id uuid)
returns void
language sql security definer set search_path = public
as $$
    insert into public.news_views (news_id, count)
    select id, 1 from public.news where id = p_id and status = 'publicada' and date <= now()
    on conflict (news_id) do update set count = public.news_views.count + 1;
$$;

-- Exclusão da própria conta (a API do navegador não consegue apagar auth.users sozinha).
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;
    delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.hit_news(uuid) to anon, authenticated;
-- Funções de trigger não devem ser chamáveis pela API (/rest/v1/rpc/...).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_role() from public, anon, authenticated;
revoke execute on function public.comments_set_author() from public, anon, authenticated;
revoke execute on function public.news_track_changes() from public, anon, authenticated;
revoke execute on function public.news_clear_updated() from public, anon, authenticated;

-- =====================================================================
-- Row Level Security: é AQUI que a segurança de verdade acontece.
-- A chave "anon" é pública; sem estas políticas qualquer pessoa editaria tudo.
-- =====================================================================
alter table public.profiles   enable row level security;
alter table public.news       enable row level security;
alter table public.comments   enable row level security;
alter table public.reports    enable row level security;
alter table public.newsletter enable row level security;
alter table public.news_views enable row level security;
alter table public.favorites  enable row level security;
alter table public.authors    enable row level security;
alter table public.news_versions enable row level security;

-- Nas políticas, auth.uid() e is_admin() ficam dentro de (select ...) para o Postgres
-- avaliá-los uma vez por consulta, e não linha a linha.

-- profiles: cada um lê/edita o próprio; admin lê todos. (o papel só muda pelo SQL Editor)
create policy "profiles: ler o proprio ou admin" on public.profiles
    for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: editar o proprio" on public.profiles
    for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- news: público lê só publicadas cuja data já chegou (data futura = agendada); admin faz tudo.
create policy "news: ler publicadas ou admin" on public.news
    for select to anon, authenticated using ((status = 'publicada' and date <= now()) or (select public.is_admin()));
create policy "news: admin cria" on public.news
    for insert to authenticated with check ((select public.is_admin()));
create policy "news: admin edita" on public.news
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "news: admin exclui" on public.news
    for delete to authenticated using ((select public.is_admin()));

-- comments: lê os de matérias publicadas; qualquer um comenta em matéria publicada;
-- exclui o autor (se logado) ou admin.
create policy "comments: ler" on public.comments
    for select to anon, authenticated using (
        (select public.is_admin()) or exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
create policy "comments: criar" on public.comments
    for insert to anon, authenticated with check (
        (user_id is null or user_id = (select auth.uid()))
        and exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
create policy "comments: excluir proprio ou admin" on public.comments
    for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- reports: qualquer um envia; só admin lê/exclui.
create policy "reports: enviar" on public.reports
    for insert to anon, authenticated with check (true);
create policy "reports: admin le" on public.reports
    for select to authenticated using ((select public.is_admin()));
create policy "reports: admin exclui" on public.reports
    for delete to authenticated using ((select public.is_admin()));

-- newsletter: qualquer um assina; só admin lê.
create policy "newsletter: assinar" on public.newsletter
    for insert to anon, authenticated with check (true);
create policy "newsletter: admin le" on public.newsletter
    for select to authenticated using ((select public.is_admin()));

-- news_views: leitura pública (escrita só via hit_news()).
create policy "views: ler" on public.news_views
    for select to anon, authenticated using (true);

-- favorites: só o dono.
create policy "favorites: dono" on public.favorites
    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- authors: leitura pública; só admin cadastra/edita/exclui.
create policy "authors: ler" on public.authors
    for select to anon, authenticated using (true);
create policy "authors: admin cria" on public.authors
    for insert to authenticated with check ((select public.is_admin()));
create policy "authors: admin edita" on public.authors
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "authors: admin exclui" on public.authors
    for delete to authenticated using ((select public.is_admin()));

-- news_versions: só admin lê/exclui (quem grava é o gatilho news_track_changes).
create policy "versions: admin le" on public.news_versions
    for select to authenticated using ((select public.is_admin()));
create policy "versions: admin exclui" on public.news_versions
    for delete to authenticated using ((select public.is_admin()));

-- ---------- Privilégios mínimos (o RLS acima filtra as linhas) ----------
-- O Supabase concede ALL (inclusive TRUNCATE, que o RLS não filtra) por padrão: revogamos
-- e concedemos só o necessário. Inserções/atualizações ficam limitadas às colunas que o
-- cliente pode preencher; datas, papel (role) e contadores são definidos só pelo banco.
revoke all on public.profiles, public.news, public.comments, public.reports,
              public.newsletter, public.news_views, public.favorites,
              public.authors, public.news_versions from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select                                                   on public.news       to anon, authenticated;
grant insert, update, delete                                   on public.news       to authenticated;
grant select                                                   on public.comments   to anon, authenticated;
grant insert (id, news_id, user_id, name, text)                on public.comments   to anon, authenticated;
grant delete                                                   on public.comments   to authenticated;
grant insert (id, subject, story, anonymous, name, email, attachment) on public.reports to anon, authenticated;
grant select, delete                                           on public.reports    to authenticated;
grant insert (email)                                           on public.newsletter to anon, authenticated;
grant select                                                   on public.newsletter to authenticated;
grant select                                                   on public.news_views to anon, authenticated;
grant select                                                   on public.profiles   to authenticated;
grant update (name, bio, city, interests, avatar)              on public.profiles   to authenticated;
grant select, delete                                           on public.favorites  to authenticated;
grant insert (user_id, news_id)                                on public.favorites  to authenticated;
grant select                                                   on public.authors    to anon, authenticated;
grant insert (id, name, role, bio, avatar, columnist)          on public.authors    to authenticated;
grant update (name, role, bio, avatar, columnist)              on public.authors    to authenticated;
grant delete                                                   on public.authors    to authenticated;
grant select, delete                                           on public.news_versions to authenticated;

-- =====================================================================
-- Supabase Storage: imagens das notícias enviadas pelo painel.
-- Bucket público (leitura pela URL); enviar/trocar/apagar só administradores.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-images', 'news-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "news-images: admin lista" on storage.objects
    for select to authenticated using (bucket_id = 'news-images' and (select public.is_admin()));
create policy "news-images: admin envia" on storage.objects
    for insert to authenticated with check (bucket_id = 'news-images' and (select public.is_admin()));
create policy "news-images: admin troca" on storage.objects
    for update to authenticated using (bucket_id = 'news-images' and (select public.is_admin()))
    with check (bucket_id = 'news-images' and (select public.is_admin()));
create policy "news-images: admin apaga" on storage.objects
    for delete to authenticated using (bucket_id = 'news-images' and (select public.is_admin()));
