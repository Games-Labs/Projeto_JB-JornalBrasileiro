/* =========================================================
   JB — Backend Supabase (substitui a camada local quando config.js está preenchido)
   Carregado logo depois de storage.js. Se `JB.remote` for falso este arquivo não faz nada.

   Carregamento (do mais rápido para o mais lento, tudo em paralelo):
     - JB.authReady: sessão + perfil do usuário (cabeçalho, páginas de conta).
     - JB.ready:     + notícias, leituras e favoritos (páginas de conteúdo).
     - Sob demanda:  Comments.load(id) na matéria; Reports.load()/Newsletter.load()/Comments.load() no painel.
   As leituras continuam síncronas (cache em memória). As escritas atualizam o cache na hora
   e vão para o Supabase em seguida; se falharem, o cache é desfeito, aparece um aviso e o
   evento `jb:sync-error` é disparado para a página se redesenhar. `JB.flush()` espera as
   gravações pendentes e diz se todas deram certo.

   Segurança: a chave usada aqui é a pública (anon/publishable). Quem protege os dados são as
   políticas RLS e os privilégios de supabase/01_schema.sql — nunca este arquivo.
   ========================================================= */
(function () {
    'use strict';
    if (!JB.remote) return;

    const cfg = window.JB_CONFIG;
    const { News, Auth, Reports, Views, Favs, Comments, Newsletter, Media, Authors, Versions } = JB;
    const isPublished = JB.util.isPublished;
    const guestFavs = { all: Favs.all, has: Favs.has, toggle: Favs.toggle, ids: Favs.ids, clear: Favs.clear };
    const BUCKET = 'news-images';
    const NEWS_COLS = 'id,category,title,subtitle,image,author,body,status,featured,date,kind,verdict,live,sources,corrections,updates,timeline,people,chart,updated_at';
    const AUTHOR_COLS = 'id,name,role,bio,avatar,columnist,created_at';
    const TIMEOUT_MS = 15000, UPLOAD_TIMEOUT_MS = 60000;

    // Dados que vieram de versões antigas do modo local não valem mais aqui (e alguns são
    // pessoais: contas com hash fraco, sessão, denúncias). Apaga do navegador.
    ['news', 'users', 'session', 'reports', 'views', 'comments', 'newsletter', 'authors', 'versions', 'seed'].forEach(k => { try { localStorage.removeItem(JB.KEYS[k]); } catch (e) { } });

    // Parâmetros de retorno do e-mail de recuperação: lidos antes de o supabase-js limpá-los da URL.
    const urlAuth = (() => {
        const h = new URLSearchParams(location.hash.replace(/^#/, '')), q = new URLSearchParams(location.search);
        const pick = k => h.get(k) || q.get(k) || '';
        return { type: pick('type'), error: pick('error'), errorCode: pick('error_code') };
    })();

    // Nenhuma requisição fica pendurada para sempre: sem resposta em 15 s (60 s para upload), aborta.
    function fetchWithTimeout(input, init) {
        init = init || {};
        const ctrl = new AbortController();
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const t = setTimeout(() => ctrl.abort(), /\/storage\/v1\/object\//.test(url) && init.method && init.method !== 'GET' ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
        if (init.signal) { if (init.signal.aborted) ctrl.abort(); else init.signal.addEventListener('abort', () => ctrl.abort()); }
        return fetch(input, Object.assign({}, init, { signal: ctrl.signal })).finally(() => clearTimeout(t));
    }

    const sb = window.supabase && window.supabase.createClient
        ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { global: { fetch: fetchWithTimeout } })
        : null;

    // Marca de "sessão de recuperação" (só nesta aba). Não guarda senha nem token: o token
    // continua sob controle do supabase-js; aqui fica apenas o id do usuário que abriu o link.
    const RECOVERY_KEY = 'jb_recovery';
    const ss = { get() { try { return sessionStorage.getItem(RECOVERY_KEY); } catch (e) { return null; } }, set(v) { try { sessionStorage.setItem(RECOVERY_KEY, v); } catch (e) { } }, del() { try { sessionStorage.removeItem(RECOVERY_KEY); } catch (e) { } } };
    let recoveryUser = null;
    if (sb) sb.auth.onAuthStateChange((event, session) => {
        // Não chamar outros métodos do Supabase aqui dentro (pode travar o lock interno do supabase-js).
        if (event === 'PASSWORD_RECOVERY' && session) { recoveryUser = session.user.id; ss.set(session.user.id); }
        if (event === 'SIGNED_OUT') { recoveryUser = null; ss.del(); }
    });

    // Cache em memória do que o usuário atual pode ver
    const C = { me: null, news: [], authors: [], versions: {}, comments: [], commentsLoaded: {}, reports: [], views: {}, favs: [], newsletter: 0 };
    const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);
    const nowIso = () => new Date().toISOString();
    const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
    const pageUrl = file => new URL(JB.util.root() + 'pages/' + file, location.href).href;

    /* ---------- Avisos ---------- */
    function notify(msg, type) {
        let el = document.getElementById('jb-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'jb-toast'; el.setAttribute('role', 'alert');
            document.body.appendChild(el);
        }
        el.className = 'jb-toast alert alert-' + (type || 'danger') + ' shadow';
        el.textContent = msg; el.hidden = false;
        clearTimeout(notify.t); notify.t = setTimeout(() => { el.hidden = true; }, 6000);
    }
    const syncError = what => document.dispatchEvent(new CustomEvent('jb:sync-error', { detail: { what } }));

    /* ---------- Execução das operações ---------- */
    const pending = new Set();
    // Executa uma gravação. `undo` desfaz a mudança otimista no cache se o servidor recusar.
    function run(makeOp, what, undo) {
        const p = Promise.resolve().then(() => { if (!sb) throw new Error('supabase-js não carregou'); return makeOp(); }).then(({ error }) => {
            if (error) { console.error(error); if (undo) undo(); if (what) { notify('Não foi possível ' + what + '. Verifique sua conexão e tente novamente.'); syncError(what); } }
            return !error;
        }, e => { console.error(e); if (undo) undo(); if (what) { notify('Falha de conexão ao ' + what + '. Tente novamente.'); syncError(what); } return false; });
        pending.add(p); p.finally(() => pending.delete(p));
        return p;
    }
    JB.flush = () => Promise.all([...pending]).then(rs => rs.every(Boolean));

    // Leitura: devolve `fallback` em caso de erro e registra a falha.
    async function get(makeOp, fallback, critical) {
        try {
            if (!sb) throw new Error('supabase-js não carregou');
            const { data, error } = await makeOp();
            if (error) throw error;
            return data == null ? fallback : data;
        } catch (e) {
            console.error(e);
            if (critical) JB.loadError = e;
            return fallback;
        }
    }
    const authError = e => {
        const m = (e && e.message || '').toLowerCase(), code = (e && e.code) || '';
        if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
        if (m.includes('not confirmed')) return 'Confirme seu e-mail (veja a caixa de entrada) antes de entrar.';
        if (m.includes('already registered')) return 'Já existe uma conta com este e-mail.';
        if (code === 'over_email_send_rate_limit' || m.includes('rate limit') || m.includes('too many') || (e && e.status === 429)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
        if (code === 'same_password' || m.includes('different from the old')) return 'A nova senha precisa ser diferente da anterior.';
        if (code === 'weak_password' || m.includes('password')) return 'Senha fraca ou inválida: use ao menos ' + JB.PASSWORD_MIN + ' caracteres.';
        if (e && (e.name === 'AuthRetryableFetchError' || e.status === 0 || e.name === 'AbortError')) return 'Falha de conexão. Verifique sua internet e tente novamente.';
        console.error(e); return 'Não foi possível concluir. Tente novamente.';
    };

    /* ---------- Carga inicial (em paralelo) ---------- */
    const toUser = (p, u) => ({ id: p.id, name: p.name, email: u.email, role: p.role, bio: p.bio, city: p.city, interests: p.interests || [], avatar: p.avatar || '', created: p.created_at });
    const toAuthor = a => ({ id: a.id, name: a.name, role: a.role, bio: a.bio, avatar: a.avatar || '', columnist: !!a.columnist, created: a.created_at });

    async function loadMe(user) {
        C.me = null;
        if (!user) return;
        const p = await get(() => sb.from('profiles').select('id,name,role,bio,city,interests,avatar,created_at').eq('id', user.id).maybeSingle(), null);
        if (p) C.me = toUser(p, user);
    }
    async function loadFavs(user) {
        const favs = user ? await get(() => sb.from('favorites').select('news_id').order('created_at', { ascending: false }), []) : [];
        C.favs = favs.map(f => f.news_id);
    }

    const session = sb ? sb.auth.getSession().then(r => (r.data && r.data.session) || null, e => { console.error(e); return null; }) : Promise.resolve(null);
    const authReady = session.then(s => loadMe(s && s.user));
    const dataReady = Promise.all([
        get(() => sb.from('news').select(NEWS_COLS).order('date', { ascending: false }), [], true).then(rows => { C.news = rows.map(JB.util.withDefaults); }),
        get(() => sb.from('authors').select(AUTHOR_COLS).order('name'), []).then(rows => { C.authors = rows.map(toAuthor); }),
        get(() => sb.from('news_views').select('news_id,count'), []).then(rows => { C.views = {}; rows.forEach(v => { C.views[v.news_id] = Number(v.count); }); }),
        session.then(s => loadFavs(s && s.user))
    ]);

    /* ---------- Notícias ---------- */
    const bucketPath = url => { const pre = cfg.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/public/' + BUCKET + '/'; return typeof url === 'string' && url.indexOf(pre) === 0 ? decodeURIComponent(url.slice(pre.length)) : null; };
    const removeImage = url => { const path = bucketPath(url); if (path) run(() => sb.storage.from(BUCKET).remove([path])); };   // limpeza; falha não afeta a notícia

    Object.assign(News, {
        everything() { return C.news.slice().sort(byDateDesc); },
        all() { return News.everything().filter(isPublished); },
        get(id) { return C.news.find(x => x.id === id) || null; },
        save(item) {
            const i = C.news.findIndex(x => x.id === item.id);
            delete item.updated_at;   // definida só pelo banco (gatilho news_track_changes)
            if (i >= 0) {
                const before = Object.assign({}, C.news[i]);
                const change = JB.util.changeKind(before, item);
                Object.assign(C.news[i], item);
                if (change) C.news[i].updated_at = nowIso();   // o gatilho do banco faz o mesmo
                if (change === 'version') delete C.versions[item.id];   // a lista de versões será baixada de novo
                const patch = Object.assign({}, item); delete patch.id;
                run(() => sb.from('news').update(patch).eq('id', item.id), 'salvar a notícia', () => { const j = C.news.findIndex(x => x.id === item.id); if (j >= 0) C.news[j] = before; })
                    .then(ok => { if (ok && 'image' in item && before.image !== item.image) removeImage(before.image); });
                return C.news[i];
            }
            item.id = uuid(); item.date = item.date || nowIso();
            C.news.push(JB.util.withDefaults(Object.assign({}, item)));
            run(() => sb.from('news').insert(item), 'salvar a notícia', () => { C.news = C.news.filter(x => x.id !== item.id); });
            return item;
        },
        // Relê uma matéria do servidor (usado pela cobertura ao vivo). true = conseguiu.
        async refresh(id) {
            const row = await get(() => sb.from('news').select(NEWS_COLS).eq('id', id).maybeSingle(), undefined);
            if (row === undefined) return false;
            C.news = C.news.filter(x => x.id !== id);
            if (row) C.news.push(JB.util.withDefaults(row));
            return true;
        },
        remove(id) {
            const before = { news: C.news, comments: C.comments }, gone = News.get(id);
            C.news = C.news.filter(x => x.id !== id);
            C.comments = C.comments.filter(c => c.newsId !== id);
            run(() => sb.from('news').delete().eq('id', id), 'excluir a notícia', () => { C.news = before.news; C.comments = before.comments; })
                .then(ok => { if (ok && gone) removeImage(gone.image); });
        }
    });

    /* ---------- Autores (leitura pública; só o editor grava) ---------- */
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
    Object.assign(Authors, {
        all() { return C.authors.slice().sort(byName); },
        get(name) { return C.authors.find(a => a.name === name) || null; },
        columnists() { return Authors.all().filter(a => a.columnist); },
        save(a) {
            if (C.authors.some(x => x.name.toLowerCase() === a.name.trim().toLowerCase() && x.id !== a.id)) return { ok: false, error: 'Já existe um autor com esse nome.' };
            const row = { name: a.name.trim(), role: a.role || '', bio: a.bio || '', avatar: a.avatar || '', columnist: !!a.columnist };
            const i = C.authors.findIndex(x => x.id === a.id);
            if (i >= 0) {
                const before = Object.assign({}, C.authors[i]);
                Object.assign(C.authors[i], row);
                run(() => sb.from('authors').update(row).eq('id', a.id), 'salvar o autor', () => { const j = C.authors.findIndex(x => x.id === a.id); if (j >= 0) C.authors[j] = before; })
                    .then(ok => { if (ok && before.avatar !== row.avatar) removeImage(before.avatar); });
                return { ok: true, author: C.authors[i] };
            }
            row.id = uuid();
            C.authors.push(Object.assign({ created: nowIso() }, row));
            run(() => sb.from('authors').insert(row), 'salvar o autor', () => { C.authors = C.authors.filter(x => x.id !== row.id); });
            return { ok: true, author: row };
        },
        remove(id) {
            const before = C.authors, gone = C.authors.find(a => a.id === id);
            C.authors = C.authors.filter(a => a.id !== id);
            run(() => sb.from('authors').delete().eq('id', id), 'excluir o autor', () => { C.authors = before; })
                .then(ok => { if (ok && gone) removeImage(gone.avatar); });
        },
        load() { return dataReady.then(() => true, () => false); }   // já vêm na carga inicial
    });

    /* ---------- Versões das matérias (só o editor lê; quem grava é o gatilho do banco) ---------- */
    Object.assign(Versions, {
        async load(newsId) {
            if (!Auth.isAdmin()) return true;
            if (C.versions[newsId]) return true;
            const rows = await get(() => sb.from('news_versions').select('id,replaced_at,replaced_by,snapshot').eq('news_id', newsId).order('replaced_at', { ascending: false }).limit(20), null);
            if (!rows) return false;
            C.versions[newsId] = rows.map(v => ({ id: v.id, replacedAt: v.replaced_at, replacedBy: v.replaced_by, snapshot: v.snapshot }));
            return true;
        },
        forNews(id) { return (C.versions[id] || []).slice(); }
    });

    /* ---------- Imagens (Supabase Storage) ---------- */
    Object.assign(Media, {
        async upload(blob) {
            if (!sb) throw new Error('Sem conexão com o servidor.');
            const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
            const path = new Date().getFullYear() + '/' + uuid() + '.' + ext;
            const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
            if (error) { console.error(error); throw new Error('Não foi possível enviar a imagem. Verifique sua conexão e se você está logado como editor.'); }
            return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        }
    });

    /* ---------- Visualizações ---------- */
    Object.assign(Views, {
        hit(id) { C.views[id] = (C.views[id] || 0) + 1; run(() => sb.rpc('hit_news', { p_id: id })); },
        count(id) { return C.views[id] || 0; },
        total() { return Object.keys(C.views).reduce((s, k) => s + C.views[k], 0); },
        top(n) { return News.all().filter(x => C.views[x.id]).sort((a, b) => C.views[b.id] - C.views[a.id]).slice(0, n); }
    });

    /* ---------- Comentários (baixados sob demanda) ---------- */
    const toComment = c => ({ id: c.id, newsId: c.news_id, userId: c.user_id, name: c.name, text: c.text, date: c.date });
    Object.assign(Comments, {
        // load(newsId): comentários de uma matéria; load(): todos (painel do editor).
        async load(newsId) {
            const key = newsId || '*';
            if (C.commentsLoaded[key] || C.commentsLoaded['*']) return true;
            const q = () => { let b = sb.from('comments').select('id,news_id,user_id,name,text,date').order('date', { ascending: false }); if (newsId) b = b.eq('news_id', newsId); return newsId ? b.limit(200) : b; };
            let failed = false;
            const rows = await get(q, null);
            if (!rows) failed = true;
            const fresh = (rows || []).map(toComment);
            C.comments = (newsId ? C.comments.filter(c => c.newsId !== newsId) : []).concat(fresh);
            if (!failed) C.commentsLoaded[key] = true;
            return !failed;
        },
        forNews(id) { return C.comments.filter(c => c.newsId === id).sort(byDateDesc); },
        flat() { return C.comments.slice().sort(byDateDesc); },
        add(id, c) {
            // Logado: o banco grava o nome e a autoria da própria conta (gatilho comments_set_author).
            const row = { id: uuid(), news_id: id, user_id: C.me ? C.me.id : null, name: C.me ? C.me.name : c.name, text: c.text };
            C.comments.push({ id: row.id, newsId: id, userId: row.user_id, name: row.name, text: c.text, date: nowIso() });
            run(() => sb.from('comments').insert(row), 'publicar o comentário', () => { C.comments = C.comments.filter(x => x.id !== row.id); });
        },
        remove(newsId, cid) {
            const before = C.comments;
            C.comments = C.comments.filter(c => c.id !== cid);
            run(() => sb.from('comments').delete().eq('id', cid), 'excluir o comentário', () => { C.comments = before; });
        }
    });

    /* ---------- Denúncias (qualquer um envia; só o editor lê) ---------- */
    Object.assign(Reports, {
        async load() {
            if (!Auth.isAdmin()) return true;
            const rows = await get(() => sb.from('reports').select('id,subject,story,anonymous,name,email,attachment,date').order('date', { ascending: false }), null);
            if (rows) C.reports = rows;
            return !!rows;
        },
        all() { return C.reports.slice().sort(byDateDesc); },
        add(r) {
            const row = { id: uuid(), subject: r.subject, story: r.story, anonymous: !!r.anonymous, name: r.name || '', email: r.email || '', attachment: r.attachment || null };
            if (Auth.isAdmin()) C.reports.push(Object.assign({ date: nowIso() }, row));
            run(() => sb.from('reports').insert(row), 'enviar a denúncia', () => { C.reports = C.reports.filter(x => x.id !== row.id); });
            return row;
        },
        remove(id) { const before = C.reports; C.reports = C.reports.filter(r => r.id !== id); run(() => sb.from('reports').delete().eq('id', id), 'excluir a denúncia', () => { C.reports = before; }); }
    });

    /* ---------- Newsletter (assíncrona: true = inscrito/já inscrito, null = erro) ---------- */
    Object.assign(Newsletter, {
        async load() {
            if (!Auth.isAdmin() || !sb) return true;
            try { const { count, error } = await sb.from('newsletter').select('email', { count: 'exact', head: true }); if (error) throw error; C.newsletter = count || 0; return true; } catch (e) { console.error(e); return false; }
        },
        count() { return C.newsletter; },
        async add(email) {
            email = email.trim().toLowerCase();
            if (!sb) return null;
            try {
                const { error } = await sb.from('newsletter').insert({ email });
                // E-mail já inscrito também conta como sucesso: a resposta não revela quem já assina.
                if (!error || error.code === '23505') { if (!error) C.newsletter++; return true; }
                console.error(error); return null;
            } catch (e) { console.error(e); return null; }
        }
    });

    /* ---------- Favoritos: sincronizados com a conta; visitantes continuam no navegador ---------- */
    Object.assign(Favs, {
        all() { return C.me ? C.favs.map(News.get).filter(n => n && isPublished(n)) : guestFavs.all(); },
        has(id) { return C.me ? C.favs.includes(id) : guestFavs.has(id); },
        toggle(id) {
            if (!C.me) return guestFavs.toggle(id);
            const had = C.favs.includes(id), before = C.favs;
            C.favs = had ? C.favs.filter(x => x !== id) : [id].concat(C.favs);
            run(() => had ? sb.from('favorites').delete().eq('news_id', id).eq('user_id', C.me.id) : sb.from('favorites').insert({ user_id: C.me.id, news_id: id }), 'atualizar os favoritos', () => { C.favs = before; });
            return !had;
        }
    });
    // Ao entrar, os favoritos salvos como visitante passam para a conta.
    async function mergeGuestFavs() {
        if (!C.me || !guestFavs.ids().length) return;
        await dataReady.catch(() => { });
        const ids = guestFavs.ids().filter(id => News.get(id));   // ignora matérias que não existem mais
        if (!ids.length) { guestFavs.clear(); return; }
        const { data } = await sb.from('favorites').select('news_id');
        const have = new Set((data || []).map(f => f.news_id));
        const rows = ids.filter(id => !have.has(id)).map(id => ({ user_id: C.me.id, news_id: id }));
        if (rows.length && !(await run(() => sb.from('favorites').insert(rows)))) return;   // mantém no navegador se falhar
        guestFavs.clear();
    }

    /* ---------- Autenticação (Supabase Auth) — métodos de conta são assíncronos ---------- */
    Object.assign(Auth, {
        users() { return C.me ? [C.me] : []; },
        current() { return C.me; },
        isAdmin() { return !!C.me && C.me.role === 'admin'; },
        async register({ name, email, password }) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            email = email.trim().toLowerCase();
            const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name: name.trim() }, emailRedirectTo: pageUrl('login.html') } });
            if (error) return { ok: false, error: authError(error) };
            if (data.user && data.user.identities && data.user.identities.length === 0) return { ok: false, error: 'Já existe uma conta com este e-mail.' };
            if (!data.session) return { ok: true, pending: true };      // confirmação por e-mail ativada no Supabase
            await loadMe(data.session.user);
            return { ok: true, user: C.me };
        },
        async login(email, password) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
            if (error) return { ok: false, error: authError(error) };
            await loadMe(data.user);
            if (!C.me) return { ok: false, error: 'Perfil não encontrado para esta conta.' };
            await mergeGuestFavs().catch(e => console.error(e));
            return { ok: true, user: C.me };
        },
        async logout() { if (sb) await sb.auth.signOut().catch(e => console.error(e)); C.me = null; C.favs = []; },
        update(patch) {
            if (!C.me) return null;
            const row = {}, before = Object.assign({}, C.me);
            ['name', 'bio', 'city', 'interests', 'avatar'].forEach(k => { if (k in patch) row[k] = patch[k]; });
            Object.assign(C.me, row);
            run(() => sb.from('profiles').update(row).eq('id', C.me.id), 'salvar o perfil', () => { if (C.me) Object.assign(C.me, before); });
            return C.me;
        },
        async changePassword(current, next) {
            if (!C.me || !sb) return false;
            const check = await sb.auth.signInWithPassword({ email: C.me.email, password: current });   // confere a senha atual
            if (check.error) return false;
            const { error } = await sb.auth.updateUser({ password: next });
            return !error;
        },
        async deleteAccount() {
            if (!C.me) return;
            const ok = await run(() => sb.rpc('delete_my_account'), 'excluir a conta');
            if (!ok) return;
            await sb.auth.signOut({ scope: 'local' }); C.me = null;
        },

        /* ----- Recuperação de senha (fluxo oficial do Supabase Auth) ----- */
        // Sempre responde igual, exista ou não a conta: só falha de rede/limite são informados.
        async requestPasswordReset(email) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            try {
                const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: pageUrl('redefinir-senha.html') });
                if (!error) return { ok: true };
                if (error.status === 429 || error.code === 'over_email_send_rate_limit') return { ok: false, error: authError(error) };
                if (error.name === 'AuthRetryableFetchError' || !error.status) return { ok: false, error: 'Falha de conexão. Verifique sua internet e tente novamente.' };
                console.warn('Recuperação de senha: o servidor recusou o pedido (status ' + error.status + '). Veja Authentication > Logs no painel do Supabase.');
                return { ok: true };
            } catch (e) { console.error(e); return { ok: false, error: 'Falha de conexão. Verifique sua internet e tente novamente.' }; }
        },
        // 'ready' (pode redefinir) | 'expired' (link vencido) | 'invalid' (sem sessão de recuperação)
        async recoveryState() {
            if (!sb) return 'invalid';
            await authReady;
            await new Promise(r => setTimeout(r, 0));   // o supabase-js avisa PASSWORD_RECOVERY num setTimeout
            const { data } = await sb.auth.getSession();
            const user = data && data.session && data.session.user;
            if (user && (recoveryUser === user.id || ss.get() === user.id)) return 'ready';
            return urlAuth.error ? 'expired' : 'invalid';   // ex.: error_code=otp_expired no retorno do e-mail
        },
        async updatePassword(next) {
            if ((await Auth.recoveryState()) !== 'ready') return { ok: false, expired: true, error: 'Sua sessão de recuperação expirou ou é inválida. Peça um novo link.' };
            const { error } = await sb.auth.updateUser({ password: next });
            if (error) {
                if (error.status === 401 || error.status === 403 || /session/i.test(error.message || '')) return { ok: false, expired: true, error: 'Sua sessão de recuperação expirou. Peça um novo link.' };
                return { ok: false, error: authError(error) };
            }
            ss.del(); recoveryUser = null;
            // Encerra a sessão de recuperação e as sessões antigas em outros aparelhos.
            await sb.auth.signOut().catch(e => console.error(e));
            C.me = null;
            return { ok: true };
        }
    });

    JB.storageOk = () => true;
    JB.mode = 'supabase';
    if (!sb) JB.loadError = new Error('supabase-js não carregou');
    JB.authReady = authReady.catch(e => { console.error(e); });
    JB.ready = Promise.all([JB.authReady, dataReady]).catch(e => { console.error(e); JB.loadError = JB.loadError || e; }).then(() => {
        if (JB.loadError) notify('Não foi possível conectar ao servidor. Algumas informações podem não aparecer.', 'warning');
    });
})();
