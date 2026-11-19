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
    -- Cargos: admin (só pelo SQL Editor) > coordenador > jornalista > leitor (padrão)
    role       text not null default 'leitor' constraint profiles_role_check check (role in ('admin', 'coordenador', 'jornalista', 'leitor')),
    bio        text not null default '' check (char_length(bio) <= 1000),
    city       text not null default '' check (char_length(city) <= 120),
    interests  text[] not null default '{}' check (cardinality(interests) <= 20),
    avatar     text not null default '' check (char_length(avatar) <= 300000)
               -- só data URL de imagem (o site recorta e reduz para JPEG 256 px); nada de URL externa ou SVG
               constraint profiles_avatar_format check (avatar = '' or avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$'),
    created_at timestamptz not null default now(),
    age_verified_at timestamptz   -- idade mínima confirmada (cadastro ou confirm_age); a data de nascimento não é guardada
);

-- Idade mínima para ter conta (supabase/08_seguranca.sql explica as regras de segurança)
create or replace function public.min_age()
returns int
language sql immutable set search_path = ''
as $$ select 16 $$;

-- Devolve o cargo de quem está logado SÓ se a conta está liberada nesta sessão:
--   idade confirmada E (sessão aal2 OU leitor sem MFA ativado). Senão, null.
-- Todas as políticas usam esta função (direto ou por is_staff/is_editor/is_admin).
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$
    select p.role from public.profiles p
     where p.id = (select auth.uid())
       and p.age_verified_at is not null
       and (coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
            or (p.role = 'leitor'
                and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')));
$$;
create or replace function public.account_ok()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.my_role() is not null $$;
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin', 'coordenador', 'jornalista'), false) $$;
create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('admin', 'coordenador'), false) $$;
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'admin', false) $$;


-- Antes de criar a conta: confere a data de nascimento enviada pelo cadastro e a descarta.
-- Sem data (Google, convite) a conta nasce sem idade confirmada e só grava algo depois de
-- confirm_age(). Data inválida ou menor de 16: o cadastro é recusado.
create or replace function public.check_signup_age()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare b date;
begin
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
drop trigger if exists check_signup_age on auth.users;
create trigger check_signup_age
    before insert on auth.users
    for each row execute function public.check_signup_age();

-- Cria o perfil (role sempre 'leitor'); a idade vem confirmada se o cadastro a validou.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    insert into public.profiles (id, name, age_verified_at)
    values (
        new.id,
        left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 120),
        case when new.raw_user_meta_data ->> 'jb_age_ok' = 'true' then now() end
    );
    return new;
end;
$$;


create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

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
    image     text not null default '' check (char_length(image) <= 1500000)  -- caminho local, URL https ou data URL de imagem
              constraint news_image_format check (image = '' or image ~ '^(assets/img/[A-Za-z0-9_-][A-Za-z0-9._-]*|https://[^[:space:]"''<>\\]+|data:image/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2})$'),
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
    created_by  uuid references public.profiles(id) on delete set null,   -- quem criou (gatilho news_set_creator)
    constraint news_extras_check check (
        jsonb_typeof(sources) = 'array' and pg_column_size(sources) <= 20000
        and jsonb_typeof(corrections) = 'array' and pg_column_size(corrections) <= 20000
        and jsonb_typeof(updates) = 'array' and pg_column_size(updates) <= 200000
        and jsonb_typeof(timeline) = 'array' and pg_column_size(timeline) <= 20000
        and jsonb_typeof(people) = 'array' and pg_column_size(people) <= 20000
        and (chart is null or (jsonb_typeof(chart) = 'object' and pg_column_size(chart) <= 10000)))
);
create index news_status_date_idx on public.news (status, date desc);
create index news_created_by_idx on public.news (created_by);

-- ---------- Autores (jornalistas e colunistas) ----------
create table public.authors (
    id         uuid primary key default gen_random_uuid(),
    name       text not null unique check (char_length(trim(name)) between 1 and 120),
    role       text not null default 'Repórter' check (char_length(role) <= 80),
    bio        text not null default '' check (char_length(bio) <= 1000),
    avatar     text not null default '' check (char_length(avatar) <= 2000)    -- URL https (Storage) ou caminho local
               constraint authors_avatar_format check (avatar = '' or avatar ~ '^(assets/img/[A-Za-z0-9_-][A-Za-z0-9._-]*|https://[^[:space:]"''<>\\]+)$'),
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

create trigger news_set_creator
    before insert or update on public.news
    for each row execute function public.news_set_creator();

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
-- Excluir a própria conta: se a pessoa ativou o MFA, só com a sessão verificada (aal2).
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;
    if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
       and exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then
        raise exception 'confirme a verificação em duas etapas antes de excluir a conta' using errcode = '42501';
    end if;
    perform public.audit('account.deleted', 'profile', auth.uid()::text, '', '{}'::jsonb);
    delete from auth.users where id = auth.uid();
end;
$$;

-- ---------- Hierarquia da redação e perfis públicos ----------
-- Registro das mudanças de cargo feitas pelo painel (só set_member_role grava).
create table public.role_changes (
    id              bigint generated always as identity primary key,
    target_id       uuid references public.profiles(id) on delete set null,
    target_name     text not null default '',
    old_role        text not null,
    new_role        text not null,
    changed_by      uuid references public.profiles(id) on delete set null,
    changed_by_name text not null default '',
    changed_at      timestamptz not null default now()
);
create index role_changes_at_idx on public.role_changes (changed_at desc);
create index role_changes_target_idx on public.role_changes (target_id);
create index role_changes_by_idx on public.role_changes (changed_by);

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

-- Muda o cargo de alguém seguindo a hierarquia: admin coloca leitor/jornalista/coordenador;
-- coordenador só coloca/tira jornalista; ninguém muda o próprio; admin só pelo SQL Editor.
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

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.news_set_creator() from public, anon, authenticated;
revoke all on function public.list_members(text) from public, anon;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.list_members(text) to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.my_role(), public.is_staff(), public.is_editor() to anon, authenticated;
grant execute on function public.public_profile(uuid), public.staff_profiles() to anon, authenticated;
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
alter table public.role_changes enable row level security;

-- Nas políticas, auth.uid() e as funções de cargo ficam dentro de (select ...) para o Postgres
-- avaliá-los uma vez por consulta, e não linha a linha.

-- profiles: cada um lê/edita o próprio; admin lê todos. O cargo muda só pelo SQL Editor ou por
-- set_member_role; o perfil público (nome, foto, bio, cargo) sai pelas funções public_profile/staff_profiles.
create policy "profiles: ler o proprio ou admin" on public.profiles
    for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: editar o proprio" on public.profiles
    for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- news: público lê só publicadas cuja data já chegou (data futura = agendada); a equipe lê todas.
-- Coordenador/admin fazem tudo; jornalista cria e edita só as próprias, e só até "aprovada".
create policy "news: ler publicadas ou equipe" on public.news
    for select to anon, authenticated using ((status = 'publicada' and date <= now()) or (select public.is_staff()));
create policy "news: equipe cria" on public.news
    for insert to authenticated with check (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista' and created_by = (select auth.uid()) and status in ('rascunho', 'revisao', 'aprovada')));
create policy "news: equipe edita" on public.news
    for update to authenticated
    using (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista' and created_by = (select auth.uid()) and status in ('rascunho', 'revisao', 'aprovada')))
    with check (
        (select public.is_editor())
        or ((select public.my_role()) = 'jornalista' and created_by = (select auth.uid()) and status in ('rascunho', 'revisao', 'aprovada')));
create policy "news: editor exclui" on public.news
    for delete to authenticated using ((select public.is_editor()));

-- comments: lê os de matérias publicadas; qualquer um comenta em matéria publicada;
-- exclui o autor (se logado) ou coordenador/admin.
create policy "comments: ler" on public.comments
    for select to anon, authenticated using (
        (select public.is_editor()) or exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
create policy "comments: criar" on public.comments
    for insert to anon, authenticated with check (
        (user_id is null or user_id = (select auth.uid()))
        and exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
create policy "comments: excluir proprio ou editor" on public.comments
    for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_editor()));

-- reports: qualquer um envia; só coordenador/admin lê/exclui.
create policy "reports: enviar" on public.reports
    for insert to anon, authenticated with check (true);
create policy "reports: editor le" on public.reports
    for select to authenticated using ((select public.is_editor()));
create policy "reports: editor exclui" on public.reports
    for delete to authenticated using ((select public.is_editor()));

-- newsletter: qualquer um assina; só coordenador/admin lê.
create policy "newsletter: assinar" on public.newsletter
    for insert to anon, authenticated with check (true);
create policy "newsletter: editor le" on public.newsletter
    for select to authenticated using ((select public.is_editor()));

-- news_views: leitura pública (escrita só via hit_news()).
create policy "views: ler" on public.news_views
    for select to anon, authenticated using (true);

-- favorites: só o dono.
create policy "favorites: dono" on public.favorites
    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- authors: leitura pública; só coordenador/admin cadastra/edita/exclui.
create policy "authors: ler" on public.authors
    for select to anon, authenticated using (true);
create policy "authors: editor cria" on public.authors
    for insert to authenticated with check ((select public.is_editor()));
create policy "authors: editor edita" on public.authors
    for update to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
create policy "authors: editor exclui" on public.authors
    for delete to authenticated using ((select public.is_editor()));

-- news_versions: coordenador/admin; jornalista só das próprias matérias (quem grava é o gatilho news_track_changes).
create policy "versions: equipe le" on public.news_versions
    for select to authenticated using (
        (select public.is_editor())
        or ((select public.is_staff()) and exists (select 1 from public.news n where n.id = news_versions.news_id and n.created_by = (select auth.uid()))));
create policy "versions: editor exclui" on public.news_versions
    for delete to authenticated using ((select public.is_editor()));

-- role_changes: coordenador/admin leem; só set_member_role grava.
create policy "role_changes: editor le" on public.role_changes
    for select to authenticated using ((select public.is_editor()));

-- ---------- Privilégios mínimos (o RLS acima filtra as linhas) ----------
-- O Supabase concede ALL (inclusive TRUNCATE, que o RLS não filtra) por padrão: revogamos
-- e concedemos só o necessário. Inserções/atualizações ficam limitadas às colunas que o
-- cliente pode preencher; datas, papel (role) e contadores são definidos só pelo banco.
revoke all on public.profiles, public.news, public.comments, public.reports,
              public.newsletter, public.news_views, public.favorites,
              public.authors, public.news_versions, public.role_changes from anon, authenticated;
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
grant select                                                   on public.role_changes to authenticated;

-- =====================================================================
-- Supabase Storage: imagens das notícias enviadas pelo painel.
-- Bucket público (leitura pela URL); enviar/trocar/apagar só administradores.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-images', 'news-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- A equipe envia; trocar/apagar só coordenador/admin ou quem enviou o arquivo.
create policy "news-images: equipe lista" on storage.objects
    for select to authenticated using (bucket_id = 'news-images' and (select public.is_staff()));
create policy "news-images: equipe envia" on storage.objects
    for insert to authenticated with check (bucket_id = 'news-images' and (select public.is_staff()));
create policy "news-images: editor ou dono troca" on storage.objects
    for update to authenticated
    using (bucket_id = 'news-images' and ((select public.is_editor()) or ((select public.is_staff()) and owner_id = (select auth.uid())::text)))
    with check (bucket_id = 'news-images' and ((select public.is_editor()) or ((select public.is_staff()) and owner_id = (select auth.uid())::text)));
create policy "news-images: editor ou dono apaga" on storage.objects
    for delete to authenticated
    using (bucket_id = 'news-images' and ((select public.is_editor()) or ((select public.is_staff()) and owner_id = (select auth.uid())::text)));

-- =====================================================================
-- Central de Segurança: auditoria, idade mínima, limites contra spam e MFA da equipe
-- (igual a supabase/08_seguranca.sql; detalhes no cabeçalho daquele arquivo)
-- =====================================================================
-- ---------- 3. Auditoria ----------
create table if not exists public.audit_log (
    id           bigint generated always as identity primary key,
    at           timestamptz not null default now(),
    actor_id     uuid references public.profiles(id) on delete set null,
    actor_name   text not null default '',
    actor_role   text,
    action       text not null check (char_length(action) <= 60),
    target_type  text not null default '' check (char_length(target_type) <= 40),
    target_id    text not null default '' check (char_length(target_id) <= 80),
    target_label text not null default '' check (char_length(target_label) <= 300),
    details      jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4000)
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);
create index if not exists audit_log_action_idx on public.audit_log (action, at desc);
alter table public.audit_log enable row level security;

-- Grava um evento em nome de quem está logado (null = SQL Editor / sistema).
create or replace function public.audit(p_action text, p_type text, p_id text, p_label text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid(); n text; r text;
begin
    if uid is not null then select name, role into n, r from public.profiles where id = uid; end if;
    insert into public.audit_log (actor_id, actor_name, actor_role, action, target_type, target_id, target_label, details)
    values (case when n is null then null else uid end, coalesce(n, case when uid is null then 'Sistema / SQL Editor' else '' end), r,
            left(p_action, 60), left(coalesce(p_type, ''), 40), left(coalesce(p_id, ''), 80), left(coalesce(p_label, ''), 300), coalesce(p_details, '{}'::jsonb));
end;
$$;

-- Matérias: criação, mudança de status, edição de conteúdo e exclusão
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
        if (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict, new.sources, new.timeline, new.people, new.chart, new.corrections)
           is distinct from
           (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict, old.sources, old.timeline, old.people, old.chart, old.corrections) then
            perform public.audit('news.edit', 'news', new.id::text, new.title, '{}'::jsonb);
        end if;
        if new.featured and not old.featured then
            perform public.audit('news.featured', 'news', new.id::text, new.title, '{}'::jsonb);
        end if;
    end if;
    return null;
end;
$$;
drop trigger if exists audit_news on public.news;
create trigger audit_news after insert or update or delete on public.news
    for each row execute function public.audit_news();

-- Comentário apagado por outra pessoa = moderação
create or replace function public.audit_comment_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    -- (comentários apagados junto com a matéria não contam: a matéria já não existe)
    if auth.uid() is distinct from old.user_id and exists (select 1 from public.news where id = old.news_id) then
        perform public.audit('comment.moderate', 'comment', old.id::text, left(old.text, 120),
            jsonb_build_object('autor', old.name, 'news_id', old.news_id));
    end if;
    return null;
end;
$$;
drop trigger if exists audit_comment_delete on public.comments;
create trigger audit_comment_delete after delete on public.comments
    for each row execute function public.audit_comment_delete();

create or replace function public.audit_report_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    perform public.audit('report.delete', 'report', old.id::text, old.subject, '{}'::jsonb);
    return null;
end;
$$;
drop trigger if exists audit_report_delete on public.reports;
create trigger audit_report_delete after delete on public.reports
    for each row execute function public.audit_report_delete();

create or replace function public.audit_authors()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if tg_op = 'INSERT' then perform public.audit('author.create', 'author', new.id::text, new.name, '{}'::jsonb);
    elsif tg_op = 'DELETE' then perform public.audit('author.delete', 'author', old.id::text, old.name, '{}'::jsonb);
    else perform public.audit('author.edit', 'author', new.id::text, new.name, '{}'::jsonb);
    end if;
    return null;
end;
$$;
drop trigger if exists audit_authors on public.authors;
create trigger audit_authors after insert or update or delete on public.authors
    for each row execute function public.audit_authors();

-- Toda mudança de cargo (pelo painel ou pelo SQL Editor)
create or replace function public.audit_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if new.role is distinct from old.role then
        perform public.audit('role.change', 'profile', new.id::text, new.name, jsonb_build_object('from', old.role, 'to', new.role));
    end if;
    return null;
end;
$$;
drop trigger if exists audit_profile_role on public.profiles;
create trigger audit_profile_role after update of role on public.profiles
    for each row execute function public.audit_profile_role();

-- Eventos de conta informados pelo próprio site (login, MFA, senha). Só ações da lista, só
-- sobre a própria conta, no máximo 30 por 10 minutos.
create or replace function public.log_account_event(p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
    if auth.uid() is null or p_action not in ('login', 'mfa.enabled', 'mfa.disabled', 'mfa.verified', 'password.changed') then
        raise exception 'evento inválido' using errcode = '22023';
    end if;
    if (select count(*) from public.audit_log where actor_id = auth.uid() and at > now() - interval '10 minutes') >= 30 then
        return;
    end if;
    perform public.audit('account.' || p_action, 'profile', auth.uid()::text, '', jsonb_build_object('aal', coalesce(auth.jwt() ->> 'aal', 'aal1')));
end;
$$;

-- Confirma a idade de quem ainda não confirmou (ex.: entrou pelo Google). Menor de 16: a conta
-- é apagada na hora (o JB não guarda dados de quem não tem a idade mínima).
create or replace function public.confirm_age(p_birth date)
returns text
language plpgsql security definer set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'não autenticado' using errcode = '42501';
    end if;
    if exists (select 1 from public.profiles where id = auth.uid() and age_verified_at is not null) then
        return 'ok';
    end if;
    if p_birth is null or p_birth < date '1900-01-01' or p_birth > current_date then
        raise exception 'data inválida' using errcode = '22023';
    end if;
    if p_birth > (current_date - make_interval(years => public.min_age()))::date then
        perform public.audit('account.underage_deleted', 'profile', auth.uid()::text, '', '{}'::jsonb);
        delete from auth.users where id = auth.uid();
        return 'underage';
    end if;
    update public.profiles set age_verified_at = now() where id = auth.uid();
    perform public.audit('account.age_confirmed', 'profile', auth.uid()::text, '', '{}'::jsonb);
    return 'ok';
end;
$$;

-- ---------- 6. Limites contra spam ----------
-- Contados no banco (o navegador não consegue burlar). Só valem para a API (anon/authenticated).
create or replace function public.throttle_inserts()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
    -- papel da requisição (PostgREST faz SET ROLE); current_user aqui seria o dono da função
    if coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated') then return new; end if;
    if tg_table_name = 'comments' then
        if new.user_id is not null then
            select count(*) into n from public.comments where user_id = new.user_id and date > now() - interval '1 minute';
            if n >= 5 then raise exception 'JB: muitos comentários seguidos; aguarde um minuto' using errcode = '54000'; end if;
        else
            select count(*) into n from public.comments where user_id is null and date > now() - interval '10 minutes';
            if n >= 30 then raise exception 'JB: muitos comentários de visitantes; tente mais tarde' using errcode = '54000'; end if;
        end if;
    elsif tg_table_name = 'reports' then
        select count(*) into n from public.reports where date > now() - interval '10 minutes';
        if n >= 30 then raise exception 'JB: muitas denúncias em pouco tempo; tente mais tarde' using errcode = '54000'; end if;
    elsif tg_table_name = 'newsletter' then
        select count(*) into n from public.newsletter where created_at > now() - interval '10 minutes';
        if n >= 30 then raise exception 'JB: muitas inscrições em pouco tempo; tente mais tarde' using errcode = '54000'; end if;
    end if;
    return new;
end;
$$;
create index if not exists comments_date_idx on public.comments (date desc);
drop trigger if exists throttle_comments on public.comments;
create trigger throttle_comments before insert on public.comments for each row execute function public.throttle_inserts();
drop trigger if exists throttle_reports on public.reports;
create trigger throttle_reports before insert on public.reports for each row execute function public.throttle_inserts();
drop trigger if exists throttle_newsletter on public.newsletter;
create trigger throttle_newsletter before insert on public.newsletter for each row execute function public.throttle_inserts();

-- ---------- 7. Resumo para a aba "Segurança" (coordenador e admin) ----------
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
                order by case p.role when 'admin' then 0 when 'coordenador' then 1 else 2 end, p.name)
            from public.profiles p join auth.users u on u.id = p.id
            where p.role in ('admin', 'coordenador', 'jornalista')), '[]'::jsonb),
        'audit_24h', (select count(*) from public.audit_log where at > now() - interval '24 hours'));
end;
$$;

-- ---------- 8. Políticas ----------
-- Conta não liberada (idade não confirmada, ou MFA pendente) não grava nada em nome próprio.
drop policy if exists "profiles: conta liberada edita" on public.profiles;
create policy "profiles: conta liberada edita" on public.profiles
    as restrictive for update to authenticated using ((select public.account_ok())) with check ((select public.account_ok()));
drop policy if exists "favorites: conta liberada grava" on public.favorites;
create policy "favorites: conta liberada grava" on public.favorites
    as restrictive for insert to authenticated with check ((select public.account_ok()));
drop policy if exists "favorites: conta liberada apaga" on public.favorites;
create policy "favorites: conta liberada apaga" on public.favorites
    as restrictive for delete to authenticated using ((select public.account_ok()));
drop policy if exists "comments: conta liberada comenta" on public.comments;
create policy "comments: conta liberada comenta" on public.comments
    as restrictive for insert to authenticated with check ((select public.account_ok()));
drop policy if exists "comments: conta liberada apaga" on public.comments;
create policy "comments: conta liberada apaga" on public.comments
    as restrictive for delete to authenticated using ((select public.account_ok()));

drop policy if exists "audit: editor le" on public.audit_log;
create policy "audit: editor le" on public.audit_log
    for select to authenticated using ((select public.is_editor()));

-- ---------- 9. Privilégios ----------
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
-- age_verified_at só muda por confirm_age (o update da API é por coluna e não a inclui)
revoke update on public.profiles from authenticated;
grant update (name, bio, city, interests, avatar) on public.profiles to authenticated;

revoke all on function public.audit(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.audit_news() from public, anon, authenticated;
revoke all on function public.audit_comment_delete() from public, anon, authenticated;
revoke all on function public.audit_report_delete() from public, anon, authenticated;
revoke all on function public.audit_authors() from public, anon, authenticated;
revoke all on function public.audit_profile_role() from public, anon, authenticated;
revoke all on function public.check_signup_age() from public, anon, authenticated;
revoke all on function public.throttle_inserts() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.log_account_event(text) from public, anon;
revoke all on function public.confirm_age(date) from public, anon;
revoke all on function public.security_overview() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.log_account_event(text) to authenticated;
grant execute on function public.confirm_age(date) to authenticated;
grant execute on function public.security_overview() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.min_age(), public.account_ok() to anon, authenticated;
grant execute on function public.my_role(), public.is_staff(), public.is_editor(), public.is_admin() to anon, authenticated;
