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
    age_verified_at timestamptz,  -- idade mínima confirmada (cadastro ou confirm_age); a data de nascimento não é guardada
    -- Selos de perfil (independentes do cargo); só coordenador/admin mudam, por set_member_badges
    badges     text[] not null default '{}'
               constraint profiles_badges_check check (badges <@ array['colaborador', 'apoiador', 'ajudante', 'reporter']::text[] and cardinality(badges) <= 4)
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

-- ---------- Modo lockdown (aba Segurança do painel): estado do site ----------
-- Com lockdown ligado, o banco só entrega conteúdo para a equipe (políticas "lockdown: ..." no fim).
create table public.site_settings (
    id               int primary key default 1 constraint site_settings_single check (id = 1),
    lockdown         boolean not null default false,
    lockdown_message text not null default '' check (char_length(lockdown_message) <= 500),
    changed_at       timestamptz,
    changed_by_name  text not null default ''
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;
create or replace function public.site_locked()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select s.lockdown from public.site_settings s where s.id = 1), false) $$;


-- Antes de criar a conta: confere a data de nascimento enviada pelo cadastro e a descarta.
-- Sem data (Google, convite) a conta nasce sem idade confirmada e só grava algo depois de
-- confirm_age(). Data inválida ou menor de 16: o cadastro é recusado.
create or replace function public.check_signup_age()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare b date;
begin
    if public.site_locked() then   -- modo lockdown: cadastros suspensos
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
    chart       jsonb,                                      -- {type, title, unit, source, items:[{label, value}]}
    video       text not null default ''                    -- vídeo do YouTube: ID (11) ou 'channel:UC…' (live do canal)
                constraint news_video_format check (video = '' or video ~ '^[A-Za-z0-9_-]{11}$' or video ~ '^channel:UC[A-Za-z0-9_-]{22}$'),
    updated_at  timestamptz,                                -- definida só pelo banco (gatilho)
    created_by  uuid references public.profiles(id) on delete set null,   -- quem criou (gatilho news_set_creator)
    coauthors   text[] not null default '{}'                -- coautores (aparecem na assinatura junto com author)
                constraint news_coauthors_check check (cardinality(coauthors) <= 10 and array_position(coauthors, null) is null and char_length(array_to_string(coauthors, '')) <= 1200),
    editors     uuid[] not null default '{}'                -- jornalistas que também podem editar (gatilho news_set_editors)
                constraint news_editors_check check (cardinality(editors) <= 10 and array_position(editors, null) is null),
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
create index news_editors_idx on public.news using gin (editors);

-- ---------- Autores (jornalistas e colunistas) ----------
create table public.authors (
    id         uuid primary key default gen_random_uuid(),
    name       text not null unique check (char_length(trim(name)) between 1 and 120),
    role       text not null default 'Repórter' check (char_length(role) <= 80),
    bio        text not null default '' check (char_length(bio) <= 1000),
    avatar     text not null default '' check (char_length(avatar) <= 2000)    -- URL https (Storage) ou caminho local
               constraint authors_avatar_format check (avatar = '' or avatar ~ '^(assets/img/[A-Za-z0-9_-][A-Za-z0-9._-]*|https://[^[:space:]"''<>\\]+)$'),
    columnist  boolean not null default false,
    official   boolean not null default false,   -- perfil oficial da redação: ganha o selo do JB
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

-- Pela API, só quem criou a matéria (ou coordenador/admin) muda a lista de colaboradores de edição.
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
create trigger news_set_editors
    before insert or update on public.news
    for each row execute function public.news_set_editors();

-- ---------- Comentários ----------
create table public.comments (
    id      uuid primary key default gen_random_uuid(),
    news_id uuid not null references public.news(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    name    text not null check (char_length(trim(name)) between 1 and 80),
    text    text not null check (char_length(trim(text)) between 1 and 2000),
    date    timestamptz not null default now(),
    edited_at timestamptz                          -- última edição pelo autor (gatilho comments_protect_update)
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

-- Pela API, numa edição só o texto muda (as outras colunas voltam ao valor antigo) e edited_at
-- é a hora do banco. No SQL Editor (sem auth.uid()) nada é forçado.
create or replace function public.comments_protect_update()
returns trigger
language plpgsql set search_path = public
as $$
begin
    if auth.uid() is not null then
        new.id := old.id; new.news_id := old.news_id; new.user_id := old.user_id;
        new.name := old.name; new.date := old.date;
        if new.text is distinct from old.text then new.edited_at := now(); else new.edited_at := old.edited_at; end if;
    end if;
    return new;
end;
$$;
create trigger comments_protect_update
    before update on public.comments
    for each row execute function public.comments_protect_update();

-- ---------- Denúncias / pautas ----------
-- Anexos: [{path: "<uuid>/<uuid>.jpg|webp|png|pdf", name, size, type}] no bucket privado report-files (até 6)
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
create table public.reports (
    id         uuid primary key default gen_random_uuid(),
    subject    text not null check (char_length(trim(subject)) between 1 and 200),
    story      text not null check (char_length(trim(story)) between 1 and 8000),
    anonymous  boolean not null default false,
    name       text not null default '' check (char_length(name) <= 120),
    email      text not null default '' check (char_length(email) <= 200),
    attachment jsonb check (attachment is null or (jsonb_typeof(attachment) = 'object' and pg_column_size(attachment) <= 1024)),  -- legado: só metadados {name,size}
    attachments jsonb not null default '[]'::jsonb constraint reports_attachments_check check (public.report_attachments_ok(attachments)),
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
    select id, 1 from public.news where id = p_id and status = 'publicada' and date <= now() and not public.site_locked()
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

-- Perfil público: só nome, foto, bio, cargo, selos e data de entrada (nunca e-mail, cidade ou
-- interesses). Com o site em lockdown, só a equipe enxerga.
create or replace function public.public_profile(p_id uuid)
returns table (id uuid, name text, role text, bio text, avatar text, created_at timestamptz, badges text[])
language sql stable security definer set search_path = public
as $$
    select p.id, p.name, p.role, p.bio, p.avatar, p.created_at, p.badges
      from public.profiles p
     where p.id = p_id and (not public.site_locked() or public.is_staff());
$$;

-- Equipe da redação (selo do JB) e contas com algum selo de perfil: mesmos campos públicos.
create or replace function public.staff_profiles()
returns table (id uuid, name text, role text, bio text, avatar text, created_at timestamptz, badges text[])
language sql stable security definer set search_path = public
as $$
    select p.id, p.name, p.role, p.bio, p.avatar, p.created_at, p.badges
      from public.profiles p
     where (p.role in ('admin', 'coordenador', 'jornalista') or cardinality(p.badges) > 0)
       and (not public.site_locked() or public.is_staff())
     order by case p.role when 'admin' then 0 when 'coordenador' then 1 when 'jornalista' then 2 else 3 end, p.name;
$$;

-- Lista de contas para a aba Equipe do painel (só coordenador e admin). O e-mail serve para
-- identificar a pessoa certa; a foto fica de fora (a lista seria pesada).
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
         order by case p.role when 'admin' then 0 when 'coordenador' then 1 when 'jornalista' then 2 else 3 end,
                  cardinality(p.badges) desc, p.name
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
revoke execute on function public.comments_protect_update() from public, anon, authenticated;
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
-- (jornalista também edita as matérias em que é colaborador: news.editors)
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
create policy "news: editor exclui" on public.news
    for delete to authenticated using ((select public.is_editor()));

-- comments: lê os de matérias publicadas; só quem tem conta comenta (em matéria publicada);
-- exclui o autor ou coordenador/admin.
create policy "comments: ler" on public.comments
    for select to anon, authenticated using (
        (select public.is_editor()) or exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
create policy "comments: criar" on public.comments
    for insert to authenticated with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()));
create policy "comments: excluir proprio ou editor" on public.comments
    for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_editor()));
-- O autor (logado) edita o texto do próprio comentário em matéria publicada.
create policy "comments: autor edita" on public.comments
    for update to authenticated
    using (user_id = (select auth.uid())
           and exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()))
    with check (user_id = (select auth.uid()));

-- reports: quem tem conta (liberada) envia; só coordenador/admin lê/exclui.
create policy "reports: conta envia" on public.reports
    for insert to authenticated with check ((select public.account_ok()));
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

-- news_versions: coordenador/admin; jornalista só das próprias matérias e das que colabora (quem grava é o gatilho news_track_changes).
create policy "versions: equipe le" on public.news_versions
    for select to authenticated using (
        (select public.is_editor())
        or ((select public.is_staff()) and exists (select 1 from public.news n where n.id = news_versions.news_id
                and (n.created_by = (select auth.uid()) or (select auth.uid()) = any (n.editors)))));
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
grant insert (id, news_id, user_id, name, text)                on public.comments   to authenticated;
grant delete                                                   on public.comments   to authenticated;
grant update (text)                                            on public.comments   to authenticated;   -- só o texto
grant insert (id, subject, story, anonymous, name, email, attachment, attachments) on public.reports to authenticated;
grant select, delete                                           on public.reports    to authenticated;
grant insert (email)                                           on public.newsletter to anon, authenticated;
grant select                                                   on public.newsletter to authenticated;
grant select                                                   on public.news_views to anon, authenticated;
grant select                                                   on public.profiles   to authenticated;
grant update (name, bio, city, interests, avatar)              on public.profiles   to authenticated;
grant select, delete                                           on public.favorites  to authenticated;
grant insert (user_id, news_id)                                on public.favorites  to authenticated;
grant select                                                   on public.authors    to anon, authenticated;
grant insert (id, name, role, bio, avatar, columnist, official) on public.authors   to authenticated;
grant update (name, role, bio, avatar, columnist, official)    on public.authors    to authenticated;
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
            if n >= 150 then raise exception 'JB: muitos comentários de visitantes; tente mais tarde' using errcode = '54000'; end if;
        end if;
    elsif tg_table_name = 'reports' then
        select count(*) into n from public.reports where date > now() - interval '10 minutes';
        if n >= 150 then raise exception 'JB: muitas denúncias em pouco tempo; tente mais tarde' using errcode = '54000'; end if;
    elsif tg_table_name = 'newsletter' then
        select count(*) into n from public.newsletter where created_at > now() - interval '10 minutes';
        if n >= 150 then raise exception 'JB: muitas inscrições em pouco tempo; tente mais tarde' using errcode = '54000'; end if;
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
drop policy if exists "comments: conta liberada edita" on public.comments;
create policy "comments: conta liberada edita" on public.comments
    as restrictive for update to authenticated using ((select public.account_ok())) with check ((select public.account_ok()));

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

-- =====================================================================
-- Selos de perfil, modo lockdown e anexos das denúncias
-- (igual a supabase/10_equipe_selos_lockdown.sql; detalhes no cabeçalho daquele arquivo)
-- =====================================================================
-- ---------- Selos: Colaborador, Apoiador Oficial, Ajudante do Jornal, Repórter ----------
-- Coordenador: só em leitores e jornalistas. Admin: em qualquer conta, menos administradores.
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

-- ---------- Modo lockdown ----------
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;   -- só pelas funções abaixo

create or replace function public.site_status()
returns jsonb
language sql stable security definer set search_path = public
as $$
    select jsonb_build_object('lockdown', s.lockdown, 'message', case when s.lockdown then s.lockdown_message else '' end,
                              'since', case when s.lockdown then s.changed_at end)
      from public.site_settings s where s.id = 1;
$$;

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

-- Políticas RESTRITIVAS: valem junto com as outras. Com o site aberto não mudam nada; fechado,
-- só a equipe (conta liberada) lê ou grava. Cadastros novos e leituras também param
-- (check_signup_age e hit_news).
create policy "lockdown: news" on public.news
    as restrictive for select to anon, authenticated using (not (select public.site_locked()) or (select public.is_staff()));
create policy "lockdown: comments" on public.comments
    as restrictive for all to anon, authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
create policy "lockdown: reports" on public.reports
    as restrictive for all to anon, authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
create policy "lockdown: newsletter" on public.newsletter
    as restrictive for all to anon, authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
create policy "lockdown: favorites" on public.favorites
    as restrictive for all to authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
create policy "lockdown: authors" on public.authors
    as restrictive for all to anon, authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));
create policy "lockdown: views" on public.news_views
    as restrictive for select to anon, authenticated using (not (select public.site_locked()) or (select public.is_staff()));
create policy "lockdown: profiles" on public.profiles
    as restrictive for update to authenticated
    using (not (select public.site_locked()) or (select public.is_staff()))
    with check (not (select public.site_locked()) or (select public.is_staff()));

-- ---------- Anexos das denúncias: bucket PRIVADO (só coordenador/admin abrem, por link temporário) ----------
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
create policy "report-files: conta envia" on storage.objects
    for insert to authenticated with check (bucket_id = 'report-files' and (select public.report_upload_ok()));
create policy "report-files: editor le" on storage.objects
    for select to authenticated using (bucket_id = 'report-files' and (select public.is_editor()));
create policy "report-files: editor apaga" on storage.objects
    for delete to authenticated using (bucket_id = 'report-files' and (select public.is_editor()));

-- ---------- Privilégios ----------
revoke all on function public.site_locked() from public;
revoke all on function public.site_status() from public;
revoke all on function public.set_lockdown(boolean, text) from public, anon;
revoke all on function public.set_member_badges(uuid, text[]) from public, anon;
revoke all on function public.audit_profile_badges() from public, anon, authenticated;
revoke all on function public.news_set_editors() from public, anon, authenticated;
revoke all on function public.report_upload_ok() from public, anon;
grant execute on function public.site_locked(), public.site_status() to anon, authenticated;
grant execute on function public.set_lockdown(boolean, text), public.set_member_badges(uuid, text[]) to authenticated;
grant execute on function public.report_upload_ok() to authenticated;
grant execute on function public.report_attachments_ok(jsonb) to anon, authenticated;

-- =====================================================================
-- Divisões (JB Educa e Professor), créditos de edição, selos e tags, seguir matérias,
-- notificações (sino e push) e visitas do site
-- (igual a supabase/11_divisoes_tags_notificacoes.sql; detalhes no cabeçalho daquele arquivo)
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
