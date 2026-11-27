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
    const { News, Auth, Reports, Views, Favs, Comments, Newsletter, Media, Authors, Versions, Members } = JB;
    const isPublished = JB.util.isPublished;
    const guestFavs = { all: Favs.all, has: Favs.has, toggle: Favs.toggle, ids: Favs.ids, clear: Favs.clear };
    const BUCKET = 'news-images';
    const NEWS_COLS_V8 = 'id,category,title,subtitle,image,author,body,status,featured,date,kind,verdict,live,sources,corrections,updates,timeline,people,chart,updated_at,created_by';
    const COMMENT_COLS_V8 = 'id,news_id,user_id,name,text,date';
    // Colunas da migração supabase/09_editor_video_comentarios.sql (news.video, comments.edited_at).
    // Se o site novo for publicado antes da migração, o banco responde 42703 (coluna inexistente):
    // o site volta para as colunas antigas e continua no ar, só sem vídeo e sem edição de comentário.
    // Colunas da migração supabase/10_equipe_selos_lockdown.sql (news.coauthors/editors, authors.official,
    // reports.attachments): mesma ideia, um nível a mais. schema.x = quantos níveis de colunas novas o banco tem.
    // news 3 = com as colunas da migração 11 (division, edit_credits, tags, badges)
    const schema = { news: 3, comments: 1, authors: 1, reports: 1 };
    const newsCols = () => NEWS_COLS_V8 + (schema.news >= 1 ? ',video' : '') + (schema.news >= 2 ? ',coauthors,editors' : '') + (schema.news >= 3 ? ',division,edit_credits,tags,badges' : '');
    const commentCols = () => schema.comments ? COMMENT_COLS_V8 + ',edited_at' : COMMENT_COLS_V8;
    const AUTHOR_COLS_V9 = 'id,name,role,bio,avatar,columnist,created_at';
    const authorCols = () => schema.authors ? AUTHOR_COLS_V9 + ',official' : AUTHOR_COLS_V9;
    const REPORT_COLS_V9 = 'id,subject,story,anonymous,name,email,attachment,date';
    const reportCols = () => schema.reports ? REPORT_COLS_V9 + ',attachments' : REPORT_COLS_V9;
    async function compat(key, build) {
        let r = await build();
        while (r && r.error && r.error.code === '42703' && schema[key] > 0) {
            schema[key]--;
            console.warn('O banco ainda não tem todas as migrações de supabase/ (' + key + '). Usando as colunas antigas.');
            r = await build();
        }
        return r;
    }
    const TIMEOUT_MS = 15000, UPLOAD_TIMEOUT_MS = 60000;

    // Dados que vieram de versões antigas do modo local não valem mais aqui (e alguns são
    // pessoais: contas com hash fraco, sessão, denúncias). Apaga do navegador.
    ['news', 'users', 'session', 'reports', 'views', 'comments', 'newsletter', 'authors', 'versions', 'seed', 'roleLog'].forEach(k => { try { localStorage.removeItem(JB.KEYS[k]); } catch (e) { } });

    // Parâmetros de retorno do e-mail de recuperação: lidos antes de o supabase-js limpá-los da URL.
    const urlAuth = (() => {
        const h = new URLSearchParams(location.hash.replace(/^#/, '')), q = new URLSearchParams(location.search);
        const pick = k => h.get(k) || q.get(k) || '';
        return { type: pick('type'), error: pick('error'), errorCode: pick('error_code'), errorText: pick('error_description') };
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
    const C = { aal: {}, me: null, news: [], authors: [], versions: {}, comments: [], commentsLoaded: {}, reports: [], views: {}, favs: [], newsletter: 0, members: [], roleLog: [], staff: [], staffLoaded: null,
        tags: [], follows: [], notifs: [], notifsLoaded: null, visits: [] };
    // Tabela/função que ainda não existe no banco (migração 11 não rodou): segue sem o recurso
    const missing = e => !!e && ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(e.code);
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
        if (code === 'captcha_failed' || m.includes('captcha')) return 'Não conseguimos confirmar que você não é um robô. Aguarde a verificação da página (ou recarregue) e tente de novo.';
        if (code === 'insufficient_aal') return 'Digite o código do app autenticador para continuar.';
        if (code === 'weak_password' || m.includes('password')) return 'Senha fraca: use ao menos ' + JB.PASSWORD_MIN + ' caracteres, com letra minúscula, maiúscula, número e símbolo.';
        if (m.includes('database error saving new user')) return 'Não foi possível criar a conta. Confira a data de nascimento: o JB aceita cadastros a partir de ' + JB.MIN_AGE + ' anos.';
        if (e && (e.name === 'AuthRetryableFetchError' || e.status === 0 || e.name === 'AbortError')) return 'Falha de conexão. Verifique sua internet e tente novamente.';
        console.error(e); return 'Não foi possível concluir. Tente novamente.';
    };

    const mfaError = e => {
        const m = (e && e.message || '').toLowerCase(), code = (e && e.code) || '';
        if (code === 'mfa_verification_failed' || m.includes('invalid totp') || m.includes('invalid code')) return 'Código incorreto ou vencido. Confira o app autenticador e digite o código atual.';
        if (code === 'too_many_enrolled_mfa_factors') return 'Esta conta já tem o máximo de aparelhos cadastrados. Remova um antes de adicionar outro.';
        if (code === 'insufficient_aal') return 'Confirme primeiro o código do app autenticador que já está ativo.';
        if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled' || m.includes('not enabled')) return 'A verificação em duas etapas não está ligada no Supabase (Authentication > Multi-Factor).';
        return authError(e);
    };
    // O Supabase devolve o QR code como SVG cru ("data:image/svg+xml;utf-8,<svg…"): codifica para usar em <img>
    const qrSrc = q => {
        const m = /^data:image\/svg\+xml;(?:charset=)?utf-?8,([\s\S]*)$/i.exec(q || '');
        if (m) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m[1].charAt(0) === '%' ? decodeURIComponent(m[1]) : m[1]);
        return /^data:image\/(png|svg\+xml)/i.test(q || '') ? q : '';
    };
    let googleCheck = null;

    /* ---------- Carga inicial (em paralelo) ---------- */
    const toUser = (p, u) => ({ id: p.id, name: p.name, email: u.email, role: p.role, bio: p.bio, city: p.city, interests: p.interests || [], avatar: p.avatar || '', created: p.created_at, ageVerified: p.age_verified_at || null, badges: p.badges || [], notifyLive: !!p.notify_live });
    const toAuthor = a => ({ id: a.id, name: a.name, role: a.role, bio: a.bio, avatar: a.avatar || '', columnist: !!a.columnist, official: !!a.official, created: a.created_at });

    const PROFILE_COLS = 'id,name,role,bio,city,interests,avatar,created_at,age_verified_at';
    let profileBadges = 2;   // 2 = com badges e notify_live; 1 = sem a migração 11; 0 = sem a migração 10
    async function loadMe(user) {
        C.me = null;
        if (!user) return;
        const q = () => sb.from('profiles').select(PROFILE_COLS + (profileBadges >= 1 ? ',badges' : '') + (profileBadges >= 2 ? ',notify_live' : '')).eq('id', user.id).maybeSingle();
        const p = await get(async () => { let r = await q(); while (r.error && r.error.code === '42703' && profileBadges > 0) { profileBadges--; r = await q(); } return r; }, null);
        if (p) C.me = toUser(p, user);
    }
    // Nível da sessão (aal1 = só senha/Google; aal2 = passou pelo app autenticador) e se a conta tem
    // MFA ativo (nextLevel aal2). Lido do token, sem ir ao servidor.
    async function refreshAal() {
        C.aal = {};
        if (!sb) return;
        try {
            const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
            if (data) C.aal = { current: data.currentLevel, next: data.nextLevel };
        } catch (e) { console.error(e); }
    }
    async function loadFavs(user) {
        const favs = user ? await get(() => sb.from('favorites').select('news_id').order('created_at', { ascending: false }), []) : [];
        C.favs = favs.map(f => f.news_id);
    }

    const session = sb ? sb.auth.getSession().then(r => (r.data && r.data.session) || null, e => { console.error(e); return null; }) : Promise.resolve(null);
    const authReady = session.then(s => Promise.all([loadMe(s && s.user), refreshAal()]));
    // Modo lockdown: estado público do site (sem a migração 10, o site fica sempre aberto)
    const siteReady = sb ? sb.rpc('site_status').then(r => {
        if (r.error) { if (r.error.code !== 'PGRST202') console.warn(r.error); return { lockdown: false, message: '', since: null }; }
        const d = r.data || {};
        return { lockdown: !!d.lockdown, message: String(d.message || ''), since: d.since || null };
    }, e => { console.error(e); return { lockdown: false, message: '', since: null }; }) : Promise.resolve({ lockdown: false, message: '', since: null });
    const dataReady = Promise.all([
        get(() => compat('news', () => sb.from('news').select(newsCols()).order('date', { ascending: false })), [], true).then(rows => { C.news = rows.map(JB.util.withDefaults); }),
        get(() => compat('authors', () => sb.from('authors').select(authorCols()).order('name')), []).then(rows => { C.authors = rows.map(toAuthor); }),
        get(() => sb.from('news_views').select('news_id,count'), []).then(rows => { C.views = {}; rows.forEach(v => { C.views[v.news_id] = Number(v.count); }); }),
        session.then(s => loadFavs(s && s.user)),
        // Catálogos de tags e selos (sem a migração 11: sem tags e com os selos padrão)
        sb ? sb.from('tags').select('slug,name,description,created_at').order('name').then(r => { if (r.error) { if (!missing(r.error)) console.error(r.error); return; } C.tags = (r.data || []).map(toTag); }, e => console.error(e)) : null,
        sb ? sb.from('badges').select('slug,label,description,color,for_profiles,for_news,active,sort').then(r => { if (r.error) { if (!missing(r.error)) console.error(r.error); return; } JB._internal.setBadgeCatalog((r.data || []).map(toBadge)); }, e => console.error(e)) : null
    ]);
    function toTag(t) { return { slug: t.slug, name: t.name, description: t.description || '', created: t.created_at }; }
    function toBadge(b) { return { slug: b.slug, label: b.label, desc: b.description || '', color: b.color, forProfiles: !!b.for_profiles, forNews: !!b.for_news, active: !!b.active, sort: b.sort || 0 }; }
    // Mesma limpeza do gatilho news_clean_labels (o banco confere de novo)
    function cleanLabels(item) {
        if ('tags' in item) item.tags = [...new Set((item.tags || []).filter(t => C.tags.some(x => x.slug === t)))].slice(0, 10);
        if ('badges' in item) item.badges = [...new Set((item.badges || []).filter(b => JB.BADGES[b] && JB.BADGES[b].forNews && JB.BADGES[b].active))].slice(0, 3);
        if ('edit_credits' in item) item.edit_credits = [...new Set((item.edit_credits || []).map(x => String(x || '').trim()).filter(Boolean))].slice(0, 10);
    }

    /* ---------- Notícias ---------- */
    const bucketPath = url => { const pre = cfg.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/public/' + BUCKET + '/'; return typeof url === 'string' && url.indexOf(pre) === 0 ? decodeURIComponent(url.slice(pre.length)) : null; };
    const removeImage = url => { const path = bucketPath(url); if (path) run(() => sb.storage.from(BUCKET).remove([path])); };   // limpeza; falha não afeta a notícia

    Object.assign(News, {
        everything() { return C.news.slice().sort(byDateDesc); },
        published() { return News.everything().filter(isPublished); },
        all() { return News.published().filter(n => n.division === 'jb'); },
        byDivision(d) { return News.published().filter(n => n.division === d); },
        get(id) { return C.news.find(x => x.id === id) || null; },
        save(item) {
            const i = C.news.findIndex(x => x.id === item.id);
            delete item.updated_at;   // definida só pelo banco (gatilho news_track_changes)
            cleanLabels(item);
            if (schema.news < 1) delete item.video;   // banco sem a migração 09
            if (schema.news < 2) { delete item.coauthors; delete item.editors; }   // banco sem a migração 10
            if (schema.news < 3) { delete item.division; delete item.edit_credits; delete item.tags; delete item.badges; }   // sem a migração 11
            if (i >= 0) {
                const before = Object.assign({}, C.news[i]);
                const change = JB.util.changeKind(before, item);
                Object.assign(C.news[i], item);
                if (change) C.news[i].updated_at = nowIso();   // o gatilho do banco faz o mesmo
                if (change === 'version') delete C.versions[item.id];   // a lista de versões será baixada de novo
                const patch = Object.assign({}, item); delete patch.id; delete patch.created_by;
                run(() => sb.from('news').update(patch).eq('id', item.id), 'salvar a notícia', () => { const j = C.news.findIndex(x => x.id === item.id); if (j >= 0) C.news[j] = before; })
                    .then(ok => { if (ok && 'image' in item && before.image !== item.image) removeImage(before.image); });
                return C.news[i];
            }
            item.id = uuid(); item.date = item.date || nowIso();
            item.created_by = C.me ? C.me.id : null;   // o gatilho news_set_creator garante o mesmo no banco
            C.news.push(JB.util.withDefaults(Object.assign({}, item)));
            run(() => sb.from('news').insert(item), 'salvar a notícia', () => { C.news = C.news.filter(x => x.id !== item.id); });
            return item;
        },
        // Relê uma matéria do servidor (usado pela cobertura ao vivo). true = conseguiu.
        async refresh(id) {
            const row = await get(() => compat('news', () => sb.from('news').select(newsCols()).eq('id', id).maybeSingle()), undefined);
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
                .then(ok => {
                    if (!ok || !gone) return;
                    removeImage(gone.image);
                    // imagens do meio do texto enviadas pelo editor (as versões também foram apagadas)
                    (gone.body || []).map(JB.util.blockOf).filter(b => b.type === 'img').forEach(b => removeImage(b.src));
                });
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
            if (schema.authors) row.official = !!a.official;   // banco sem a migração 10 não tem a coluna
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

    /* ---------- Versões das matérias (equipe lê; quem grava é o gatilho do banco) ---------- */
    Object.assign(Versions, {
        async load(newsId) {
            if (!Auth.isStaff()) return true;
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
            if (error) { console.error(error); throw new Error('Não foi possível enviar a imagem. Verifique sua conexão e se você está logado com uma conta da redação.'); }
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
    const toComment = c => ({ id: c.id, newsId: c.news_id, userId: c.user_id, name: c.name, text: c.text, date: c.date, editedAt: c.edited_at || null });
    Object.assign(Comments, {
        // Edição do texto pelo próprio autor disponível neste banco? (false = falta a migração 09)
        canEdit() { return schema.comments; },
        // load(newsId): comentários de uma matéria; load(): todos (painel do editor).
        async load(newsId) {
            const key = newsId || '*';
            if (C.commentsLoaded[key] || C.commentsLoaded['*']) return true;
            const q = () => compat('comments', () => { let b = sb.from('comments').select(commentCols()).order('date', { ascending: false }); if (newsId) b = b.eq('news_id', newsId); return newsId ? b.limit(200) : b; });
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
        // Comentários de uma conta (perfil público). O RLS só devolve os de matérias publicadas.
        async byUser(userId) {
            const rows = await get(() => compat('comments', () => sb.from('comments').select(commentCols()).eq('user_id', userId).order('date', { ascending: false }).limit(30)), null);
            return rows ? rows.map(toComment) : null;
        },
        // O autor troca o texto do próprio comentário. O banco confere (RLS + gatilho comments_protect):
        // só quem escreveu, conta liberada, e só a coluna `text`; edited_at é gravado pelo gatilho.
        update(newsId, cid, text) {
            const c = C.comments.find(x => x.id === cid);
            if (!c || !C.me || c.userId !== C.me.id || !schema.comments) return false;
            const before = { text: c.text, editedAt: c.editedAt };
            c.text = text; c.editedAt = nowIso();
            run(async () => {
                const r = await sb.from('comments').update({ text }).eq('id', cid).select('id');
                return !r.error && !(r.data && r.data.length) ? { error: new Error('comentário não atualizado (sem permissão)') } : r;
            }, 'editar o comentário', () => { Object.assign(c, before); });
            return true;
        },
        // Só quem tem conta liberada comenta. O banco grava o nome e a autoria da própria conta
        // (gatilho comments_set_author) e recusa visitantes (RLS). false = não enviado.
        add(id, c) {
            if (!C.me || !Auth.accountOk()) return false;
            const row = { id: uuid(), news_id: id, user_id: C.me.id, name: C.me.name, text: c.text };
            C.comments.push({ id: row.id, newsId: id, userId: row.user_id, name: row.name, text: c.text, date: nowIso() });
            run(() => sb.from('comments').insert(row), 'publicar o comentário', () => { C.comments = C.comments.filter(x => x.id !== row.id); });
            return true;
        },
        remove(newsId, cid) {
            const before = C.comments;
            C.comments = C.comments.filter(c => c.id !== cid);
            run(() => sb.from('comments').delete().eq('id', cid), 'excluir o comentário', () => { C.comments = before; });
        }
    });

    /* ---------- Denúncias (quem tem conta envia; só coordenador/admin lê) ---------- */
    // Anexos no bucket PRIVADO report-files: "<pasta aleatória>/<uuid>.<ext>". Só coordenador/admin
    // abrem, por links temporários (createSignedUrls).
    const REPORT_BUCKET = 'report-files';
    const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png', 'application/pdf': 'pdf' };
    Object.assign(Reports, {
        async load() {
            if (!Auth.isEditor()) return true;
            const rows = await get(() => compat('reports', () => sb.from('reports').select(reportCols()).order('date', { ascending: false })), null);
            if (rows) C.reports = rows.map(r => Object.assign({ attachments: [] }, r));
            return !!rows;
        },
        all() { return C.reports.slice().sort(byDateDesc); },
        // null = sem conta liberada (o banco recusaria)
        add(r) {
            if (!C.me || !Auth.accountOk()) return null;
            const row = { id: uuid(), subject: r.subject, story: r.story, anonymous: !!r.anonymous, name: r.name || '', email: r.email || '', attachment: r.attachment || null };
            const files = (r.attachments || []).map(a => ({ path: a.path, name: a.name, size: a.size, type: a.type }));
            if (files.length) row.attachments = files;
            if (Auth.isEditor()) C.reports.push(Object.assign({ date: nowIso(), attachments: [] }, row));
            run(() => sb.from('reports').insert(row), 'enviar a denúncia', () => { C.reports = C.reports.filter(x => x.id !== row.id); });
            return row;
        },
        remove(id) {
            const before = C.reports, gone = C.reports.find(r => r.id === id);
            C.reports = C.reports.filter(r => r.id !== id);
            run(() => sb.from('reports').delete().eq('id', id), 'excluir a denúncia', () => { C.reports = before; })
                .then(ok => { if (ok && gone) Reports.removeFiles(gone.attachments); });
        },
        // Envia um anexo (já reduzido, se for imagem). folder: a mesma pasta para os arquivos de uma denúncia.
        async upload(blob, name, folder) {
            if (!sb) throw new Error('Sem conexão com o servidor.');
            const ext = EXT[blob.type];
            if (!ext) throw new Error('Formato não aceito: envie imagens (JPG, PNG, WebP) ou PDF.');
            const path = folder + '/' + uuid() + '.' + ext;
            const { error } = await sb.storage.from(REPORT_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
            if (error) { console.error(error); throw new Error('Não foi possível enviar o anexo “' + name + '”. Verifique a conexão (e se a sua conta está liberada) e tente de novo.'); }
            return { path, name: String(name || 'anexo').slice(0, 200), size: blob.size, type: blob.type };
        },
        newFolder: () => uuid(),
        // { path: link temporário (1 h) } dos anexos, para o painel
        async fileUrls(list) {
            const paths = (list || []).map(a => a && a.path).filter(Boolean);
            if (!paths.length || !sb) return {};
            const { data, error } = await sb.storage.from(REPORT_BUCKET).createSignedUrls(paths, 3600);
            if (error) { console.error(error); return null; }
            const o = {};
            (data || []).forEach(d => { if (d.signedUrl) o[d.path] = d.signedUrl; });
            return o;
        },
        removeFiles(list) {
            const paths = (list || []).map(a => a && a.path).filter(Boolean);
            return paths.length ? run(() => sb.storage.from(REPORT_BUCKET).remove(paths)) : Promise.resolve(true);
        }
    });

    /* ---------- Newsletter (assíncrona: true = inscrito/já inscrito, null = erro) ---------- */
    Object.assign(Newsletter, {
        async load() {
            if (!Auth.isEditor() || !sb) return true;
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

    /* ---------- Membros: cargos (painel), equipe com selo e perfis públicos ---------- */
    // As regras da hierarquia ficam no banco (set_member_role / list_members); aqui só chamamos.
    const toPublic = p => ({ id: p.id, name: p.name, role: p.role, bio: p.bio || '', avatar: p.avatar || '', created: p.created_at, badges: p.badges || [] });
    const roleError = e => {
        const m = (e && e.message) || '';
        if (e && (e.name === 'AuthRetryableFetchError' || e.name === 'AbortError' || /fetch|network/i.test(m))) return 'Falha de conexão. Verifique sua internet e tente novamente.';
        if (/sem permissão/i.test(m)) return 'Você não tem permissão para essa mudança de cargo.';
        if (/próprio cargo|próprios selos|administradores|coordenadores só|cargo inválido|selo inválido|não encontrada/i.test(m)) return m.charAt(0).toUpperCase() + m.slice(1) + '.';
        if (e && e.code === 'PGRST202') return 'O banco ainda não tem a migração supabase/10_equipe_selos_lockdown.sql.';
        return 'Não foi possível mudar o cargo agora. Tente novamente.';
    };
    Object.assign(Members, {
        async load(q) {
            if (!Auth.isEditor()) { C.members = []; return true; }
            const rows = await get(() => sb.rpc('list_members', { p_query: String(q || '').trim() }), null);
            if (!rows) return false;
            C.members = rows.map(m => ({ id: m.id, name: m.name, email: m.email, role: m.role, created: m.created_at, badges: m.badges || [] }));
            return true;
        },
        // Selos de perfil (regras em set_member_badges, no banco)
        async setBadges(id, badges) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const list = [...new Set((badges || []).filter(b => JB.BADGES[b]))].sort();
            try {
                const { error } = await sb.rpc('set_member_badges', { p_id: id, p_badges: list });
                if (error) { console.error(error); return { ok: false, error: roleError(error).replace('mudar o cargo', 'mudar os selos') }; }
            } catch (e) { console.error(e); return { ok: false, error: roleError(e) }; }
            const m = C.members.find(x => x.id === id); if (m) m.badges = list;
            C.staffLoaded = null;
            return { ok: true };
        },
        list() { return C.members.slice(); },
        async setRole(id, role) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            try {
                const { error } = await sb.rpc('set_member_role', { p_id: id, p_role: role });
                if (error) { console.error(error); return { ok: false, error: roleError(error) }; }
            } catch (e) { console.error(e); return { ok: false, error: roleError(e) }; }
            const m = C.members.find(x => x.id === id); if (m) m.role = role;
            C.staffLoaded = null;   // a lista da equipe mudou
            return { ok: true };
        },
        async loadLog() {
            if (!Auth.isEditor()) { C.roleLog = []; return true; }
            const rows = await get(() => sb.from('role_changes').select('target_id,target_name,old_role,new_role,changed_by_name,changed_at').order('changed_at', { ascending: false }).limit(50), null);
            if (!rows) return false;
            C.roleLog = rows.map(r => ({ targetId: r.target_id, targetName: r.target_name, oldRole: r.old_role, newRole: r.new_role, byName: r.changed_by_name, date: r.changed_at }));
            return true;
        },
        log() { return C.roleLog.slice(); },
        // Equipe com selo (pública). Baixada uma vez por página, só onde é usada.
        loadStaff() {
            if (!C.staffLoaded) C.staffLoaded = get(() => sb.rpc('staff_profiles'), null).then(rows => {
                if (!rows) { C.staffLoaded = null; return false; }
                C.staff = rows.map(toPublic); return true;
            });
            return C.staffLoaded;
        },
        staff() { return C.staff.slice(); },
        staffById(id) { return C.staff.find(p => p.id === id) || null; },
        // Sem diferenciar maiúsculas (a assinatura "games" é a conta "Games")
        staffByName(name) { return C.staff.find(p => JB.util.sameName(p.name, name)) || null; },
        // Perfil público: objeto, null (não existe) ou undefined (falha de conexão)
        async profile(id) {
            if (!sb) return undefined;
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))) return null;
            try {
                const { data, error } = await sb.rpc('public_profile', { p_id: id });
                if (error) throw error;
                return data && data[0] ? toPublic(data[0]) : null;
            } catch (e) { console.error(e); return undefined; }
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
        async register({ name, email, password, birthDate, captchaToken }) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            email = email.trim().toLowerCase();
            // birth_date é conferida e descartada pelo banco (check_signup_age): só fica a data da confirmação
            const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name: name.trim(), birth_date: birthDate }, emailRedirectTo: pageUrl('login.html'), captchaToken: captchaToken || undefined } });
            if (error) return { ok: false, error: authError(error) };
            if (data.user && data.user.identities && data.user.identities.length === 0) return { ok: false, error: 'Já existe uma conta com este e-mail.' };
            if (!data.session) return { ok: true, pending: true };      // confirmação por e-mail ativada no Supabase
            await Promise.all([loadMe(data.session.user), refreshAal()]);
            return { ok: true, user: C.me };
        },
        async login(email, password, captchaToken) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password, options: { captchaToken: captchaToken || undefined } });
            if (error) return { ok: false, error: authError(error) };
            await Promise.all([loadMe(data.user), refreshAal()]);
            if (!C.me) return { ok: false, error: 'Perfil não encontrado para esta conta.' };
            Auth.logEvent('login');
            if (Auth.accountOk()) await mergeGuestFavs().catch(e => console.error(e));
            return { ok: true, user: C.me };
        },
        // Termina o login que voltou do Google (ou uma sessão já aberta): favoritos do visitante etc.
        async finishLogin() {
            if (!C.me) return false;
            if (Auth.accountOk()) await mergeGuestFavs().catch(e => console.error(e));
            return true;
        },
        // Login com o Google: só aparece se o provedor estiver ligado no Supabase (Authentication >
        // Sign In / Providers > Google). Volta para login.html, que termina o fluxo.
        googleAvailable() {
            if (!googleCheck) googleCheck = fetchWithTimeout(cfg.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/settings', { headers: { apikey: cfg.SUPABASE_ANON_KEY } })
                .then(r => r.ok ? r.json() : null).then(s => !!(s && s.external && s.external.google)).catch(() => false);
            return googleCheck;
        },
        async loginWithGoogle(next) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: pageUrl('login.html') + (next ? '?next=' + encodeURIComponent(next) : ''), queryParams: { prompt: 'select_account' } } });
            return error ? { ok: false, error: authError(error) } : { ok: true };
        },
        // Erro devolvido pelo provedor na volta do login social (ex.: a pessoa cancelou)
        oauthError() { return urlAuth.error && urlAuth.type !== 'recovery' ? (urlAuth.errorText || urlAuth.error) : ''; },

        /* ----- Conta liberada: idade confirmada + verificação em duas etapas ----- */
        ageOk() { return !!(C.me && C.me.ageVerified); },
        // 'ok' | 'challenge' (tem MFA, falta digitar o código) | 'enroll' (equipe sem MFA) | null
        mfaState() {
            if (!C.me) return null;
            if (C.aal.current === 'aal2') return 'ok';
            if (C.aal.next === 'aal2') return 'challenge';
            return JB.util.isStaffRole(C.me.role) ? 'enroll' : 'ok';
        },
        accountOk() { return Auth.ageOk() && Auth.mfaState() === 'ok'; },
        hasMfa() { return C.aal.next === 'aal2'; },
        async confirmAge(birthDate) {
            if (!C.me) return { ok: false, error: 'Entre na sua conta.' };
            const age = JB.util.ageFrom(birthDate);
            if (isNaN(age)) return { ok: false, error: 'Informe uma data de nascimento válida.' };
            const { data, error } = await sb.rpc('confirm_age', { p_birth: birthDate });
            if (error) { console.error(error); return { ok: false, error: 'Não foi possível confirmar agora. Tente novamente.' }; }
            if (data === 'underage') { await sb.auth.signOut({ scope: 'local' }).catch(() => { }); C.me = null; return { ok: false, underage: true }; }
            C.me.ageVerified = new Date().toISOString();
            return { ok: true };
        },
        async mfaFactors() {
            const { data, error } = await sb.auth.mfa.listFactors();
            if (error) { console.error(error); return null; }
            return (data.all || []).filter(f => f.status === 'verified').map(f => ({ id: f.id, name: f.friendly_name || 'App autenticador', type: f.factor_type, created: f.created_at }));
        },
        // Começa a ativação: devolve o QR code e a chave para o app autenticador
        async mfaEnroll() {
            if (!C.me) return { ok: false, error: 'Entre na sua conta.' };
            const list = await sb.auth.mfa.listFactors();
            for (const f of ((list.data && list.data.all) || []).filter(f => f.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => { });   // tentativas abandonadas
            const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'JB ' + new Date().toLocaleString('pt-BR') });
            if (error) return { ok: false, error: mfaError(error) };
            return { ok: true, id: data.id, qr: qrSrc(data.totp.qr_code), secret: data.totp.secret, uri: data.totp.uri };
        },
        // Confere o código de 6 dígitos (ativação ou login). factorId: o da ativação ou o primeiro ativo.
        async mfaVerify(code, factorId) {
            code = String(code || '').replace(/\s+/g, '');
            if (!/^\d{6}$/.test(code)) return { ok: false, error: 'Digite os 6 números que aparecem no app autenticador.' };
            const enrolling = !!factorId;
            if (!factorId) { const fs = await Auth.mfaFactors(); factorId = fs && fs[0] && fs[0].id; }
            if (!factorId) return { ok: false, error: 'Nenhum app autenticador ativo nesta conta.' };
            const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
            if (error) return { ok: false, error: mfaError(error) };
            await refreshAal();
            Auth.logEvent(enrolling ? 'mfa.enabled' : 'mfa.verified');
            await mergeGuestFavs().catch(e => console.error(e));
            return { ok: true };
        },
        async mfaRemove(factorId) {
            const { error } = await sb.auth.mfa.unenroll({ factorId });
            if (error) return { ok: false, error: mfaError(error) };
            Auth.logEvent('mfa.disabled');
            await sb.auth.refreshSession().catch(() => { });
            await refreshAal();
            return { ok: true };
        },
        // Registro de eventos da própria conta na auditoria (não bloqueia nada se falhar)
        logEvent(action) { if (sb && C.me) sb.rpc('log_account_event', { p_action: action }).then(r => { if (r.error) console.warn(r.error); }, () => { }); },
        async logout() { if (sb) await sb.auth.signOut().catch(e => console.error(e)); C.me = null; C.favs = []; },
        update(patch) {
            if (!C.me) return null;
            const row = {}, before = Object.assign({}, C.me);
            ['name', 'bio', 'city', 'interests', 'avatar'].forEach(k => { if (k in patch) row[k] = patch[k]; });
            // Conta ainda não liberada (idade ou código do app autenticador pendente): o banco recusaria.
            if (!Auth.accountOk()) { notify('Conclua a verificação da sua conta (Segurança da conta) antes de editar o perfil.'); syncError('salvar o perfil'); return null; }
            Object.assign(C.me, row);
            // O RLS não dá erro quando recusa um update: só não altera nenhuma linha. Por isso confere o retorno.
            run(async () => {
                const r = await sb.from('profiles').update(row).eq('id', C.me.id).select('id');
                return !r.error && !(r.data && r.data.length) ? { error: new Error('perfil não atualizado (conta não liberada)') } : r;
            }, 'salvar o perfil', () => { if (C.me) Object.assign(C.me, before); });
            return C.me;
        },
        // Relê o perfil e o nível da sessão (ex.: o cargo foi trocado por um coordenador)
        async refresh() {
            if (!sb) return false;
            const { data } = await sb.auth.getSession().catch(() => ({ data: null }));
            const user = data && data.session && data.session.user;
            if (!user) { C.me = null; return true; }
            await Promise.all([loadMe(user), refreshAal()]);
            return true;
        },
        // Confere a senha atual (novo login, com CAPTCHA). Quem tem MFA digita o código de novo,
        // porque o Supabase só troca a senha de uma conta com MFA numa sessão aal2.
        async changePassword(current, next, captchaToken, mfaCode) {
            if (!C.me || !sb) return { ok: false, error: 'Entre na sua conta.' };
            const hadMfa = Auth.hasMfa();
            if (hadMfa && !/^\d{6}$/.test(String(mfaCode || '').replace(/\s+/g, ''))) return { ok: false, mfa: true, error: 'Digite o código do app autenticador.' };
            const check = await sb.auth.signInWithPassword({ email: C.me.email, password: current, options: { captchaToken: captchaToken || undefined } });
            if (check.error) return { ok: false, error: /invalid login/i.test(check.error.message || '') ? 'Senha atual incorreta.' : authError(check.error) };
            await refreshAal();
            if (hadMfa) { const v = await Auth.mfaVerify(mfaCode); if (!v.ok) return { ok: false, mfa: true, error: v.error }; }
            const { error } = await sb.auth.updateUser({ password: next });
            if (error) return { ok: false, error: authError(error) };
            Auth.logEvent('password.changed');
            return { ok: true };
        },
        async deleteAccount() {
            if (!C.me) return;
            if (Auth.hasMfa() && C.aal.current !== 'aal2') { notify('Confirme a verificação em duas etapas antes de excluir a conta.'); return; }
            const ok = await run(() => sb.rpc('delete_my_account'), 'excluir a conta');
            if (!ok) return;
            await sb.auth.signOut({ scope: 'local' }); C.me = null;
        },

        /* ----- Recuperação de senha (fluxo oficial do Supabase Auth) ----- */
        // Sempre responde igual, exista ou não a conta: só falha de rede/limite são informados.
        async requestPasswordReset(email, captchaToken) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            try {
                const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: pageUrl('redefinir-senha.html'), captchaToken: captchaToken || undefined });
                if (!error) return { ok: true };
                if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'captcha_failed') return { ok: false, error: authError(error) };
                if (error.name === 'AuthRetryableFetchError' || !error.status) return { ok: false, error: 'Falha de conexão. Verifique sua internet e tente novamente.' };
                console.warn('Recuperação de senha: o servidor recusou o pedido (status ' + error.status + '). Veja Authentication > Logs no painel do Supabase.');
                return { ok: true };
            } catch (e) { console.error(e); return { ok: false, error: 'Falha de conexão. Verifique sua internet e tente novamente.' }; }
        },
        // Alternativa ao link: o código numérico do mesmo e-mail ({{ .Token }} no modelo "Reset Password").
        // O Supabase confere o código (verifyOtp type 'recovery'), abre uma sessão de recuperação e avisa
        // PASSWORD_RECOVERY, o que libera updatePassword() nesta aba. Não depende das Redirect URLs.
        async verifyRecoveryCode(email, code) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const token = String(code || '').replace(/\s+/g, '');
            if (!/^\d{6,10}$/.test(token)) return { ok: false, error: 'Digite o código numérico que chegou no e-mail.' };
            try {
                const { data, error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'recovery' });
                if (!error && data && data.session) {
                    recoveryUser = data.session.user.id; ss.set(recoveryUser);   // além do evento, para não depender da ordem
                    await refreshAal();
                    return { ok: true };
                }
                if (error && (error.status === 429 || /rate limit|too many/i.test(error.message || ''))) return { ok: false, error: authError(error) };
                if (error && (error.name === 'AuthRetryableFetchError' || !error.status)) return { ok: false, error: 'Falha de conexão. Verifique sua internet e tente novamente.' };
                // Código errado, vencido, já usado ou e-mail sem conta: mesma resposta (não revela quem é cadastrado).
                return { ok: false, invalid: true, error: 'Código inválido ou expirado. Confira o e-mail e o código mais recente, ou peça um novo.' };
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
        // Conta com MFA: o Supabase só grava a senha nova depois do código do app (sessão aal2).
        async updatePassword(next, mfaCode) {
            if ((await Auth.recoveryState()) !== 'ready') return { ok: false, expired: true, error: 'Sua sessão de recuperação expirou ou é inválida. Peça um novo link.' };
            await refreshAal();
            if (C.aal.next === 'aal2' && C.aal.current !== 'aal2') {
                if (!mfaCode) return { ok: false, mfa: true, error: 'Esta conta usa verificação em duas etapas: digite o código do app autenticador.' };
                const v = await Auth.mfaVerify(mfaCode);
                if (!v.ok) return { ok: false, mfa: true, error: v.error };
            }
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

    /* ---------- CAPTCHA (Cloudflare Turnstile) ---------- */
    // Protege login, cadastro, recuperação e troca de senha contra robôs. Quem confere o token é o
    // Supabase (Authentication > Attack Protection > CAPTCHA, com a chave secreta do Turnstile).
    // A chave do site (pública) fica em config.js. Sem ela, nada é carregado.
    const SITE_KEY = cfg.TURNSTILE_SITE_KEY || '';
    let tsLoading = null;
    const loadTurnstile = () => tsLoading || (tsLoading = new Promise((resolve, reject) => {
        if (window.turnstile) return resolve(window.turnstile);
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'));
        s.onerror = () => { tsLoading = null; reject(new Error('turnstile')); };
        document.head.appendChild(s);
    }));
    JB.Captcha = {
        enabled: !!SITE_KEY,
        // Coloca o desafio em `el`. token(): espera o token (até 15 s; '' se não vier). reset(): pede outro
        // (cada token vale uma vez só; chame depois de cada envio).
        mount(el) {
            const st = { id: null, token: '', waiters: [] };
            const settle = t => { st.waiters.splice(0).forEach(w => w(t)); };
            if (!SITE_KEY || !el) return { token: () => Promise.resolve(''), reset() { } };
            el.hidden = false;
            loadTurnstile().then(ts => {
                st.id = ts.render(el, {
                    sitekey: SITE_KEY, language: 'pt-br', size: 'flexible', action: el.dataset.action || undefined,
                    theme: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light',
                    callback: t => { st.token = t; settle(t); },
                    'expired-callback': () => { st.token = ''; },
                    'error-callback': () => { st.token = ''; settle(''); }
                });
            }).catch(e => { console.warn('CAPTCHA indisponível', e); el.textContent = 'Não foi possível carregar a verificação anti-robô. Recarregue a página se o envio falhar.'; el.className = 'form-text text-danger'; settle(''); });
            return {
                token(ms) {
                    if (st.token) return Promise.resolve(st.token);
                    return new Promise(resolve => { const t = setTimeout(() => resolve(''), ms || 15000); st.waiters.push(v => { clearTimeout(t); resolve(v); }); });
                },
                reset() { st.token = ''; if (st.id !== null && window.turnstile) { try { window.turnstile.reset(st.id); } catch (e) { } } }
            };
        }
    };

    /* ---------- Tags e catálogo de selos (migração 11) ---------- */
    const labelError = (e, what) => {
        const m = (e && e.message) || '';
        if (e && (e.name === 'AbortError' || /fetch|network/i.test(m))) return 'Falha de conexão. Verifique sua internet e tente novamente.';
        if (missing(e)) return 'O banco ainda não tem a migração supabase/11_divisoes_tags_notificacoes.sql.';
        if (e && (e.code === '42501' || /row-level security|permission/i.test(m))) return 'Você não tem permissão para isso.';
        if (e && e.code === '23514') return 'Confira os campos: algum valor não é aceito.';
        return 'Não foi possível salvar ' + what + ' agora. Tente novamente.';
    };
    Object.assign(JB.Tags, {
        all() { return C.tags.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); },
        async load() {
            if (!sb) return false;
            const r = await sb.from('tags').select('slug,name,description,created_at').order('name');
            if (r.error) { if (!missing(r.error)) console.error(r.error); return missing(r.error); }
            C.tags = (r.data || []).map(toTag); return true;
        },
        async save(t) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const isNew = !t.slug, name = String(t.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
            const slug = isNew ? JB.util.slugify(name) : t.slug;
            if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: 'Dê um nome à tag (letras ou números).' };
            const row = { name, description: String(t.description || '').trim().slice(0, 300) };
            if (isNew) {
                const old = C.tags.find(x => x.slug === slug);
                if (old) return { ok: true, tag: old, existed: true };
                const r = await sb.from('tags').insert(Object.assign({ slug }, row)).select('slug,name,description,created_at').maybeSingle();
                if (r.error && r.error.code === '23505') { await JB.Tags.load(); return { ok: true, tag: JB.Tags.get(slug), existed: true }; }
                if (r.error || !r.data) { console.error(r.error); return { ok: false, error: labelError(r.error, 'a tag') }; }
                C.tags.push(toTag(r.data)); return { ok: true, tag: toTag(r.data) };
            }
            const r = await sb.from('tags').update(row).eq('slug', slug).select('slug,name,description,created_at');
            if (r.error || !(r.data && r.data.length)) { console.error(r.error); return { ok: false, error: r.error ? labelError(r.error, 'a tag') : 'Você não tem permissão para isso.' }; }
            C.tags = C.tags.filter(x => x.slug !== slug).concat([toTag(r.data[0])]);
            return { ok: true, tag: toTag(r.data[0]) };
        },
        async remove(slug) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const r = await sb.from('tags').delete().eq('slug', slug).select('slug');
            if (r.error || !(r.data && r.data.length)) { console.error(r.error); return { ok: false, error: r.error ? labelError(r.error, 'a tag') : 'Você não tem permissão para isso.' }; }
            C.tags = C.tags.filter(x => x.slug !== slug);
            C.news.forEach(n => { if ((n.tags || []).includes(slug)) n.tags = n.tags.filter(x => x !== slug); });   // o gatilho do banco faz o mesmo
            return { ok: true };
        }
    });
    const BADGE_SEL = 'slug,label,description,color,for_profiles,for_news,active,sort';
    Object.assign(JB.Badges, {
        async load() {
            if (!sb) return false;
            const r = await sb.from('badges').select(BADGE_SEL);
            if (r.error) { if (!missing(r.error)) console.error(r.error); return missing(r.error); }
            JB._internal.setBadgeCatalog((r.data || []).map(toBadge)); return true;
        },
        async save(b, isNew) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const slug = isNew ? JB.util.slugify(b.slug || b.label, 30) : b.slug, label = String(b.label || '').trim().slice(0, 40);
            if (!label || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: 'Dê um nome ao selo.' };
            if (isNew && JB.BADGES[slug]) return { ok: false, error: 'Já existe um selo com esse identificador.' };
            const row = { label, description: String(b.desc || '').trim().slice(0, 200), color: JB.BADGE_COLORS[b.color] ? b.color : 'accent', for_profiles: !!b.forProfiles, for_news: !!b.forNews, active: b.active !== false, sort: Number(b.sort) || 0 };
            const r = isNew ? await sb.from('badges').insert(Object.assign({ slug }, row)).select(BADGE_SEL) : await sb.from('badges').update(row).eq('slug', slug).select(BADGE_SEL);
            if (r.error || !(r.data && r.data.length)) { console.error(r.error); return { ok: false, error: r.error ? (r.error.code === '23505' ? 'Já existe um selo com esse identificador.' : labelError(r.error, 'o selo')) : 'Você não tem permissão para isso.' }; }
            await JB.Badges.load();
            return { ok: true, badge: JB.BADGES[slug] };
        },
        async remove(slug) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const r = await sb.from('badges').delete().eq('slug', slug).select('slug');
            if (r.error || !(r.data && r.data.length)) { console.error(r.error); return { ok: false, error: r.error ? labelError(r.error, 'o selo') : 'Você não tem permissão para isso.' }; }
            await JB.Badges.load();
            C.news.forEach(n => { if ((n.badges || []).includes(slug)) n.badges = n.badges.filter(x => x !== slug); });
            C.staffLoaded = null;
            return { ok: true };
        }
    });

    /* ---------- Seguir matérias, notificações e push (migração 11) ---------- */
    const followsReady = session.then(s => s && s.user ? get(() => sb.from('follows').select('news_id').order('created_at', { ascending: false }), []).then(rows => { C.follows = rows.map(f => f.news_id); }) : null);
    Object.assign(JB.Follows, {
        ids() { return C.me ? C.follows.slice() : []; },
        has(id) { return !!C.me && C.follows.includes(id); },
        load() { return followsReady.then(() => true, () => false); },
        // true = passou a seguir, false = deixou de seguir, null = precisa de conta liberada / falhou
        async toggle(id) {
            if (!C.me || !Auth.accountOk() || !sb) return null;
            const had = C.follows.includes(id), before = C.follows.slice();
            C.follows = had ? C.follows.filter(x => x !== id) : [id].concat(C.follows);
            const ok = await run(() => had ? sb.from('follows').delete().eq('news_id', id).eq('user_id', C.me.id) : sb.from('follows').insert({ user_id: C.me.id, news_id: id }),
                had ? 'deixar de seguir a matéria' : 'seguir a matéria', () => { C.follows = before; });
            return ok ? !had : null;
        }
    });
    const toNotif = n => ({ id: n.id, kind: n.kind, title: n.title, body: n.body || '', url: n.url || '', newsId: n.news_id || null, date: n.created_at, readAt: n.read_at || null });
    Object.assign(JB.Notifications, {
        list() { return C.me ? C.notifs.slice() : []; },
        unread() { return C.me ? C.notifs.filter(n => !n.readAt).length : 0; },
        async load() {
            await authReady.catch(() => { });
            if (!C.me || !sb) { C.notifs = []; return true; }
            const r = await sb.from('notifications').select('id,kind,title,body,url,news_id,created_at,read_at').order('created_at', { ascending: false }).limit(50);
            if (r.error) { if (!missing(r.error)) console.error(r.error); return missing(r.error); }
            C.notifs = (r.data || []).map(toNotif); return true;
        },
        async markRead(ids) {
            if (!C.me || !sb) return false;
            const now = nowIso(), target = C.notifs.filter(n => !n.readAt && (!ids || ids.includes(n.id)));
            if (!target.length) return true;
            target.forEach(n => { n.readAt = now; });
            return run(() => sb.from('notifications').update({ read_at: now }).in('id', target.map(n => n.id)), 'marcar as notificações como lidas', () => { target.forEach(n => { n.readAt = null; }); });
        },
        async remove(id) {
            if (!C.me || !sb) return false;
            const before = C.notifs.slice();
            C.notifs = id === undefined ? [] : C.notifs.filter(n => n.id !== id);
            return run(() => id === undefined ? sb.from('notifications').delete().eq('user_id', C.me.id) : sb.from('notifications').delete().eq('id', id), 'apagar a notificação', () => { C.notifs = before; });
        }
    });
    Object.assign(Auth, {
        async setNotifyLive(on) {
            if (!C.me || !sb || profileBadges < 2) return false;
            const before = !!C.me.notifyLive;
            C.me.notifyLive = !!on;
            return run(async () => {
                const r = await sb.from('profiles').update({ notify_live: !!on }).eq('id', C.me.id).select('id');
                return !r.error && !(r.data && r.data.length) ? { error: new Error('perfil não atualizado (conta não liberada)') } : r;
            }, 'salvar a preferência de notificações', () => { if (C.me) C.me.notifyLive = before; });
        }
    });
    // Push (Web Push): chave pública VAPID em config.js; o envio é feito pela Function /api/push,
    // chamada pelo banco. Os dados do aparelho (endpoint e chaves) ficam em push_subscriptions.
    const VAPID = String(cfg.VAPID_PUBLIC_KEY || '').trim();
    const b64uToBytes = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
    const swReg = () => Promise.race([navigator.serviceWorker.ready, new Promise(res => setTimeout(() => res(null), 8000))]);
    Object.assign(JB.Push, {
        supported() { return !!VAPID && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext; },
        async state() {
            if (!JB.Push.supported()) return 'unsupported';
            if (Notification.permission === 'denied') return 'denied';
            try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); return sub ? 'on' : 'off'; } catch (e) { return 'off'; }
        },
        async enable() {
            if (!JB.Push.supported()) return { ok: false, error: 'Este navegador não recebe notificações do site.' };
            if (!C.me || !Auth.accountOk()) return { ok: false, error: 'Entre na sua conta (e conclua a verificação dela) para receber notificações.' };
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') return { ok: false, error: 'O navegador não deu permissão para notificações. Libere nas configurações do site.' };
            const reg = await swReg();
            if (!reg) return { ok: false, error: 'O app do JB ainda não terminou de instalar. Recarregue a página e tente de novo.' };
            let sub;
            try { sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID) }); }
            catch (e) { console.error(e); return { ok: false, error: 'Não foi possível ativar as notificações neste navegador.' }; }
            const j = sub.toJSON(), keys = j.keys || {};
            const { error } = await sb.rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: keys.p256dh || '', p_auth: keys.auth || '' });
            if (error) {
                console.error(error);
                if (error.code === '23514') { try { await sub.unsubscribe(); } catch (e) { } return { ok: false, error: 'O serviço de notificações deste navegador não é aceito pelo JB.' }; }
                return { ok: false, error: missing(error) ? 'O banco ainda não tem a migração supabase/11_divisoes_tags_notificacoes.sql.' : 'Não foi possível ativar as notificações agora.' };
            }
            return { ok: true };
        },
        async disable() {
            try {
                const reg = await navigator.serviceWorker.getRegistration(), sub = reg && await reg.pushManager.getSubscription();
                if (sub) { if (sb && C.me) await sb.rpc('push_unsubscribe', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
                return { ok: true };
            } catch (e) { console.error(e); return { ok: false, error: 'Não foi possível desativar as notificações agora.' }; }
        }
    });

    /* ---------- Visitas do site (painel: Estatísticas) ---------- */
    let visitHit = false;
    Object.assign(JB.Visits, {
        hit() {
            if (visitHit || !sb) return;
            visitHit = true;
            const fresh = JB._internal.newVisitorToday();
            sb.rpc('hit_site', { p_new: fresh }).then(r => { if (r.error && !missing(r.error)) console.warn(r.error); }, () => { });
        },
        async load(days) {
            if (!Auth.isStaff() || !sb) { C.visits = []; return true; }
            const since = new Date(Date.parse(JB._internal.todaySP() + 'T12:00:00') - ((days || 30) - 1) * 86400000).toISOString().slice(0, 10);
            const r = await sb.from('site_visits').select('day,views,visitors').gte('day', since).order('day');
            if (r.error) { if (!missing(r.error)) console.error(r.error); C.visits = []; return missing(r.error); }
            C.visits = r.data || []; return true;
        },
        list(days) { return JB._internal.lastDays(days || 30, C.visits); }
    });

    /* ---------- Central de Segurança (painel: coordenador e admin) ---------- */
    JB.Security = {
        overview: () => get(() => sb.rpc('security_overview'), null),
        // Auditoria, da mais recente para a mais antiga. filter: prefixo da ação ('news', 'account'…)
        audit: ({ filter, before, limit } = {}) => get(() => {
            let q = sb.from('audit_log').select('id,at,actor_id,actor_name,actor_role,action,target_type,target_id,target_label,details').order('at', { ascending: false }).limit(limit || 100);
            if (filter) q = q.like('action', filter + '.%');
            if (before) q = q.lt('at', before);
            return q;
        }, null),
        // O Supabase exige CAPTCHA? Tenta um login falso sem token: 'on' | 'off' | null (sem resposta)
        async captchaEnforced() {
            try {
                const r = await fetchWithTimeout(cfg.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'verificacao-captcha@invalid.example', password: 'x' }) });
                const b = await r.json().catch(() => ({}));
                return (b.error_code || b.code) === 'captcha_failed' || /captcha/i.test(b.msg || b.message || '') ? 'on' : 'off';
            } catch (e) { return null; }
        },
        googleEnabled: () => Auth.googleAvailable()
    };

    /* ---------- Modo lockdown (aba Segurança): o banco fecha o site para quem não é da equipe ---------- */
    JB.Site = {
        status: () => siteReady,
        async setLockdown(on, message) {
            if (!sb) return { ok: false, error: 'Sem conexão com o servidor.' };
            const { error } = await sb.rpc('set_lockdown', { p_on: !!on, p_message: String(message || '').slice(0, 500) });
            if (error) {
                console.error(error);
                return { ok: false, error: error.code === 'PGRST202' ? 'O banco ainda não tem a migração supabase/10_equipe_selos_lockdown.sql.' : /sem permissão/i.test(error.message || '') ? 'Só coordenadores e administradores (com a verificação em duas etapas) ligam o modo lockdown.' : 'Não foi possível mudar o modo lockdown agora.' };
            }
            return { ok: true };
        }
    };

    JB.storageOk = () => true;
    JB.mode = 'supabase';
    if (!sb) JB.loadError = new Error('supabase-js não carregou');
    JB.authReady = authReady.catch(e => { console.error(e); });
    JB.ready = Promise.all([JB.authReady, dataReady, siteReady]).catch(e => { console.error(e); JB.loadError = JB.loadError || e; }).then(() => {
        if (JB.loadError) notify('Não foi possível conectar ao servidor. Algumas informações podem não aparecer.', 'warning');
    });
})();
