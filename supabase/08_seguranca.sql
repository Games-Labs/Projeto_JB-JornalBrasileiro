-- =====================================================================
-- JB — Central de Segurança (2026-11)
-- Para projetos criados com uma versão anterior do 01_schema.sql (rode depois do 07).
-- Instalação nova: o 01_schema.sql já contém tudo isto; NÃO rode este arquivo.
-- Pode ser rodado mais de uma vez (idempotente).
--
-- 1. Verificação em duas etapas (MFA, app autenticador):
--    - OBRIGATÓRIA para a equipe (admin, coordenador, jornalista): sem uma sessão aal2 a pessoa
--      não tem poder nenhum da redação (my_role() devolve null);
--    - opcional para leitores, mas quem ativou só usa a conta depois de digitar o código.
-- 2. Idade mínima (16 anos): o cadastro por e-mail manda a data de nascimento, conferida aqui
--    e descartada (só fica a data em que a idade foi confirmada). Quem entra pelo Google confirma
--    no primeiro acesso (confirm_age). Sem idade confirmada a conta não grava nada.
-- 3. Auditoria: tabela audit_log, escrita só por gatilhos e funções do banco.
-- 4. Imagens: foto de perfil só como data URL de imagem; imagem de matéria/autor só caminho
--    local, https:// ou data URL de imagem (nada de javascript:, http:, SVG etc.).
-- 5. Limites contra spam em comentários, denúncias e newsletter.
-- 6. security_overview(): resumo para a aba "Segurança" do painel.
-- =====================================================================

-- ---------- 1. Idade confirmada ----------
alter table public.profiles add column if not exists age_verified_at timestamptz;

create or replace function public.min_age()
returns int
language sql immutable set search_path = ''
as $$ select 16 $$;

-- ---------- 2. Cargo efetivo: idade confirmada + MFA ----------
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

-- ---------- 4. Idade mínima no cadastro ----------
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

-- ---------- 5. Imagens: só formatos seguros ----------
alter table public.profiles drop constraint if exists profiles_avatar_format;
alter table public.profiles add constraint profiles_avatar_format
    check (avatar = '' or avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$');
alter table public.news drop constraint if exists news_image_format;
alter table public.news add constraint news_image_format
    check (image = '' or image ~ '^(assets/img/[A-Za-z0-9_-][A-Za-z0-9._-]*|https://[^[:space:]"''<>\\]+|data:image/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2})$');
alter table public.authors drop constraint if exists authors_avatar_format;
alter table public.authors add constraint authors_avatar_format
    check (avatar = '' or avatar ~ '^(assets/img/[A-Za-z0-9_-][A-Za-z0-9._-]*|https://[^[:space:]"''<>\\]+)$');

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
