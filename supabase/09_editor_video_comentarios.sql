-- =====================================================================
-- JB — Editor de matérias, vídeo do YouTube e edição de comentários (2026-11)
-- Para projetos criados com uma versão anterior do 01_schema.sql (rode depois do 08).
-- Instalação nova: o 01_schema.sql já contém tudo isto; NÃO rode este arquivo.
-- Pode ser rodado mais de uma vez (idempotente).
--
-- 1. news.video: identificador do vídeo do YouTube da matéria (ID de 11 caracteres, que serve
--    também para lives, ou "channel:UC…" para a live atual de um canal). Nada de URL livre:
--    o site monta o player (youtube-nocookie.com) a partir do identificador.
--    Entra no histórico de versões e na auditoria de edição.
-- 2. O texto das matérias agora tem formatação (intertítulos, listas, citações, negrito, itálico,
--    links) guardada como marcação simples dentro da mesma lista de strings (news.body).
--    O banco não muda: o site escapa tudo antes de mostrar.
-- 3. Comentários: quem escreveu (logado, conta liberada) edita o PRÓPRIO comentário. Só a coluna
--    `text` pode mudar; edited_at é gravado pelo gatilho. Excluir o próprio já era permitido;
--    coordenador/admin continuam excluindo qualquer um (moderação, registrada na auditoria).
-- 4. Gráficos: chart.type (bar, column, line, area, donut) fica dentro do jsonb `chart`; sem
--    mudança de coluna.
-- =====================================================================

-- ---------- 1. Vídeo da matéria ----------
alter table public.news add column if not exists video text not null default '';
alter table public.news drop constraint if exists news_video_format;
alter table public.news add constraint news_video_format
    check (video = '' or video ~ '^[A-Za-z0-9_-]{11}$' or video ~ '^channel:UC[A-Za-z0-9_-]{22}$');

-- Versões: o vídeo passa a fazer parte do conteúdo versionado
create or replace function public.news_track_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
    if (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict,
        new.sources, new.timeline, new.people, new.chart, new.video)
       is distinct from
       (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict,
        old.sources, old.timeline, old.people, old.chart, old.video) then
        insert into public.news_versions (news_id, replaced_by, snapshot)
        values (old.id,
                coalesce((select left(p.name, 120) from public.profiles p where p.id = auth.uid()), ''),
                jsonb_build_object('title', old.title, 'subtitle', old.subtitle, 'body', old.body, 'image', old.image,
                                   'author', old.author, 'category', old.category, 'kind', old.kind, 'verdict', old.verdict,
                                   'sources', old.sources, 'timeline', old.timeline, 'people', old.people, 'chart', old.chart,
                                   'video', old.video));
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

-- Auditoria: trocar o vídeo conta como edição
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
        if (new.title, new.subtitle, new.body, new.image, new.author, new.category, new.kind, new.verdict, new.sources, new.timeline, new.people, new.chart, new.corrections, new.video)
           is distinct from
           (old.title, old.subtitle, old.body, old.image, old.author, old.category, old.kind, old.verdict, old.sources, old.timeline, old.people, old.chart, old.corrections, old.video) then
            perform public.audit('news.edit', 'news', new.id::text, new.title, '{}'::jsonb);
        end if;
        if new.featured and not old.featured then
            perform public.audit('news.featured', 'news', new.id::text, new.title, '{}'::jsonb);
        end if;
    end if;
    return null;
end;
$$;

-- ---------- 3. Comentários: o autor edita o próprio ----------
alter table public.comments add column if not exists edited_at timestamptz;

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
drop trigger if exists comments_protect_update on public.comments;
create trigger comments_protect_update
    before update on public.comments
    for each row execute function public.comments_protect_update();
revoke all on function public.comments_protect_update() from public, anon, authenticated;

-- Só o autor (logado) e só em matéria publicada; a política restritiva exige conta liberada
-- (idade confirmada e, para quem tem, verificação em duas etapas), como para comentar.
drop policy if exists "comments: autor edita" on public.comments;
create policy "comments: autor edita" on public.comments
    for update to authenticated
    using (user_id = (select auth.uid())
           and exists (select 1 from public.news n where n.id = news_id and n.status = 'publicada' and n.date <= now()))
    with check (user_id = (select auth.uid()));
drop policy if exists "comments: conta liberada edita" on public.comments;
create policy "comments: conta liberada edita" on public.comments
    as restrictive for update to authenticated using ((select public.account_ok())) with check ((select public.account_ok()));

-- Privilégio por coluna: pela API só `text` pode ser atualizado. (O limite contra spam,
-- throttle_inserts, continua valendo só para comentários novos.)
revoke update on public.comments from anon, authenticated;
grant update (text) on public.comments to authenticated;
