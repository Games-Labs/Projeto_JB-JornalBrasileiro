-- =====================================================================
-- JB — Atualização de segurança e desempenho (auditoria 2026-11)
-- Para projetos criados com uma versão anterior do 01_schema.sql.
-- Instalação nova: o 01_schema.sql já contém tudo isto; NÃO rode este arquivo.
-- Pode ser rodado mais de uma vez (idempotente).
-- =====================================================================

-- ---------- 1. Privilégios mínimos por tabela e por coluna ----------
-- O Supabase concede ALL (inclusive TRUNCATE, que o RLS não filtra) a anon/authenticated
-- por padrão. Revogamos tudo e concedemos só o que o site usa. Inserções e atualizações
-- ficam limitadas às colunas que o cliente pode preencher: datas, papéis e contadores
-- passam a ser definidos apenas pelo banco.
revoke all on public.profiles, public.news, public.comments, public.reports,
              public.newsletter, public.news_views, public.favorites from anon, authenticated;

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

-- ---------- 2. Limites de tamanho que faltavam ----------
alter table public.reports  drop constraint if exists reports_attachment_check;
alter table public.reports  add  constraint reports_attachment_check
    check (attachment is null or (jsonb_typeof(attachment) = 'object' and pg_column_size(attachment) <= 1024));
alter table public.profiles drop constraint if exists profiles_interests_check;
alter table public.profiles add  constraint profiles_interests_check check (cardinality(interests) <= 20);

-- ---------- 3. Comentário de usuário logado sempre fica no nome da conta ----------
-- Impede que alguém logado comente com o nome de outra pessoa ou "solte" a autoria
-- (user_id nulo) para que o comentário não possa ser atribuído a ele.
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
revoke execute on function public.comments_set_author() from public, anon, authenticated;
drop trigger if exists comments_set_author on public.comments;
create trigger comments_set_author
    before insert on public.comments
    for each row execute function public.comments_set_author();

-- ---------- 4. Políticas RLS: auth.uid()/is_admin() avaliados uma vez por consulta ----------
-- (antes eram reavaliados linha a linha — aviso "auth_rls_initplan" do Supabase)
drop policy if exists "profiles: ler o proprio ou admin" on public.profiles;
create policy "profiles: ler o proprio ou admin" on public.profiles
    for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "profiles: editar o proprio" on public.profiles;
create policy "profiles: editar o proprio" on public.profiles
    for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "news: ler publicadas ou admin" on public.news;
create policy "news: ler publicadas ou admin" on public.news
    for select to anon, authenticated using (status = 'publicada' or (select public.is_admin()));
drop policy if exists "news: admin cria" on public.news;
create policy "news: admin cria" on public.news
    for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "news: admin edita" on public.news;
create policy "news: admin edita" on public.news
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "news: admin exclui" on public.news;
create policy "news: admin exclui" on public.news
    for delete to authenticated using ((select public.is_admin()));

drop policy if exists "comments: ler" on public.comments;
create policy "comments: ler" on public.comments
    for select to anon, authenticated using (
        (select public.is_admin()) or exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada'));
drop policy if exists "comments: criar" on public.comments;
create policy "comments: criar" on public.comments
    for insert to anon, authenticated with check (
        (user_id is null or user_id = (select auth.uid()))
        and exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada'));
drop policy if exists "comments: excluir proprio ou admin" on public.comments;
create policy "comments: excluir proprio ou admin" on public.comments
    for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "reports: admin le" on public.reports;
create policy "reports: admin le" on public.reports
    for select to authenticated using ((select public.is_admin()));
drop policy if exists "reports: admin exclui" on public.reports;
create policy "reports: admin exclui" on public.reports
    for delete to authenticated using ((select public.is_admin()));

drop policy if exists "newsletter: admin le" on public.newsletter;
create policy "newsletter: admin le" on public.newsletter
    for select to authenticated using ((select public.is_admin()));

drop policy if exists "favorites: dono" on public.favorites;
create policy "favorites: dono" on public.favorites
    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- 5. Índices para as chaves estrangeiras sem cobertura ----------
create index if not exists comments_user_idx  on public.comments  (user_id);
create index if not exists favorites_news_idx on public.favorites (news_id);

-- ---------- 6. Supabase Storage para as imagens das notícias ----------
-- Antes, a foto enviada pelo painel virava data URL (centenas de KB) dentro da tabela
-- news e era baixada em TODAS as páginas. Agora vai para um bucket público; a tabela
-- guarda só a URL. Leitura pública pela URL; enviar/trocar/apagar só administradores.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-images', 'news-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "news-images: admin lista" on storage.objects;
create policy "news-images: admin lista" on storage.objects
    for select to authenticated using (bucket_id = 'news-images' and (select public.is_admin()));
drop policy if exists "news-images: admin envia" on storage.objects;
create policy "news-images: admin envia" on storage.objects
    for insert to authenticated with check (bucket_id = 'news-images' and (select public.is_admin()));
drop policy if exists "news-images: admin troca" on storage.objects;
create policy "news-images: admin troca" on storage.objects
    for update to authenticated using (bucket_id = 'news-images' and (select public.is_admin()))
    with check (bucket_id = 'news-images' and (select public.is_admin()));
drop policy if exists "news-images: admin apaga" on storage.objects;
create policy "news-images: admin apaga" on storage.objects
    for delete to authenticated using (bucket_id = 'news-images' and (select public.is_admin()));
