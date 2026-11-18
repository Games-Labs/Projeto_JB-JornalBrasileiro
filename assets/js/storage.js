/* =========================================================
   JB — Camada de dados (localStorage compartilhado entre páginas)
   Expõe o objeto global `JB`. Todas as páginas carregam este arquivo.
   Chaves: jb_news, jb_users, jb_session, jb_reports, jb_cookies
   ========================================================= */
(function () {
    'use strict';

    const KEYS = { news: 'jb_news', users: 'jb_users', session: 'jb_session', reports: 'jb_reports', cookies: 'jb_cookies', views: 'jb_views', favs: 'jb_favs', history: 'jb_history', comments: 'jb_comments', newsletter: 'jb_newsletter', theme: 'jb_theme' };

    // Fallback em memória caso o localStorage esteja bloqueado
    const memory = {};
    let storageOk = true;
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return k in memory ? memory[k] : null; } },
        set(k, v) { try { localStorage.setItem(k, v); storageOk = true; } catch (e) { storageOk = false; memory[k] = v; } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { delete memory[k]; } }
    };
    const read = (k, fallback) => { const raw = store.get(k); if (raw === null) return fallback; try { return JSON.parse(raw); } catch (e) { return fallback; } };
    const write = (k, v) => store.set(k, JSON.stringify(v));
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    const CATEGORIES = {
        politica: { label: 'Política', page: 'pages/politica.html' },
        economia: { label: 'Economia', page: 'pages/economia.html' },
        esportes: { label: 'Esportes', page: 'pages/esportes.html' },
        investigacao: { label: 'Investigação Especial', page: 'pages/noticias.html?cat=investigacao' },
        tecnologia: { label: 'Tecnologia & Ciência', page: 'pages/noticias.html?cat=tecnologia' },
        infraestrutura: { label: 'Infraestrutura', page: 'pages/noticias.html?cat=infraestrutura' },
        brasil: { label: 'Brasil', page: 'pages/noticias.html?cat=brasil' },
        mundo: { label: 'Mundo', page: 'pages/noticias.html?cat=mundo' },
        educacao: { label: 'Educação', page: 'pages/noticias.html?cat=educacao' },
        saude: { label: 'Saúde', page: 'pages/noticias.html?cat=saude' },
        meioambiente: { label: 'Meio Ambiente', page: 'pages/noticias.html?cat=meioambiente' },
        cultura: { label: 'Cultura', page: 'pages/noticias.html?cat=cultura' }
    };
    // Fluxo editorial: rascunho → em revisão → aprovada → publicada → arquivada
    const STATUS = { rascunho: 'Rascunho', revisao: 'Em revisão', aprovada: 'Aprovada', publicada: 'Publicada', arquivada: 'Arquivada' };
    const STATUS_FLOW = ['rascunho', 'revisao', 'aprovada', 'publicada', 'arquivada'];
    const isPublished = n => !n.status || n.status === 'publicada';   // dados antigos (sem status) contam como publicados

    // Imagens locais disponíveis (usadas no painel e como fallback por categoria)
    const IMAGES = {
        'assets/img/obras-publicas.jpg': 'Edifício público (obras)',
        'assets/img/redes-sociais.jpg': 'Ícones de redes sociais',
        'assets/img/ferrovia.webp': 'Locomotiva em ferrovia',
        'assets/img/seguranca-digital.jpg': 'Chave sobre código digital',
        'assets/img/cat-politica.svg': 'Ilustração — Política',
        'assets/img/cat-economia.svg': 'Ilustração — Economia',
        'assets/img/cat-esportes.svg': 'Ilustração — Esportes',
        'assets/img/cat-brasil.svg': 'Ilustração — Brasil',
        'assets/img/cat-mundo.svg': 'Ilustração — Mundo',
        'assets/img/cat-educacao.svg': 'Ilustração — Educação',
        'assets/img/cat-saude.svg': 'Ilustração — Saúde',
        'assets/img/cat-meioambiente.svg': 'Ilustração — Meio Ambiente',
        'assets/img/cat-cultura.svg': 'Ilustração — Cultura'
    };
    const FALLBACK_IMG = {
        politica: 'assets/img/cat-politica.svg', economia: 'assets/img/cat-economia.svg', esportes: 'assets/img/cat-esportes.svg',
        investigacao: 'assets/img/obras-publicas.jpg', tecnologia: 'assets/img/seguranca-digital.jpg', infraestrutura: 'assets/img/ferrovia.webp',
        brasil: 'assets/img/cat-brasil.svg', mundo: 'assets/img/cat-mundo.svg', educacao: 'assets/img/cat-educacao.svg', saude: 'assets/img/cat-saude.svg', meioambiente: 'assets/img/cat-meioambiente.svg', cultura: 'assets/img/cat-cultura.svg'
    };

    // Hash simples SOMENTE para simulação (não é seguro para produção)
    function hash(text) {
        let h = 5381;
        for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
        return 'h' + h.toString(16);
    }

    /* ---------- Seed (executa só se as chaves ainda não existem) ---------- */
    function minutesAgo(m) { return new Date(Date.now() - m * 60000).toISOString(); }
    function seed() {
        if (store.get(KEYS.news) === null) {
            const n = (category, title, subtitle, image, minutes, body, extra) => Object.assign({
                id: uid() + category.slice(0, 2), category, title, subtitle, image, author: 'Redação JB', date: minutesAgo(minutes), featured: false,
                body: body || [subtitle, 'Esta é uma matéria de demonstração do projeto acadêmico Jornal Brasileiro (JB). O conteúdo é fictício e serve para exercitar as funcionalidades do portal.', 'Novas notícias podem ser criadas, editadas e excluídas no Painel Administrativo e aparecem automaticamente nas páginas correspondentes.']
            }, extra || {});
            write(KEYS.news, [
                n('investigacao', 'Dossiê aponta gargalos na fiscalização de obras públicas em 14 estados', 'Levantamento cruzou dados de portais de transparência e contratos emergenciais firmados nos últimos 24 meses.', 'assets/img/obras-publicas.jpg', 18, null, { featured: true, author: 'Redação Investigativa JB' }),
                n('economia', 'Banco Central sinaliza cautela com juros diante de pressão inflacionária no setor de serviços', 'Analistas avaliam que a trajetória de queda da taxa básica pode ser mais lenta que o previsto.', 'assets/img/cat-economia.svg', 42),
                n('politica', 'Relator apresenta parecer final sobre reforma administrativa nesta quinta-feira', 'Texto deve ser votado em plenário na semana seguinte, segundo a liderança.', 'assets/img/cat-politica.svg', 60),
                n('esportes', 'Confederação divulga calendário ajustado para as fases finais do campeonato nacional', 'Mudança busca reduzir o intervalo entre jogos decisivos.', 'assets/img/cat-esportes.svg', 120),
                n('tecnologia', 'Novas diretrizes de proteção de dados exigem auditoria em algoritmos públicos', 'Especialistas explicam como a fiscalização vai afetar sistemas automatizados de atendimento ao cidadão.', 'assets/img/seguranca-digital.jpg', 180),
                n('infraestrutura', 'Malha ferroviária regional recebe novo plano de concessão para transporte de cargas', 'Projeto prevê integração entre polos agrícolas e terminais portuários do Sudeste.', 'assets/img/ferrovia.webp', 240),
                n('politica', 'Comissão aprova novo marco regulatório para transparência pública', 'Proposta amplia a divulgação de contratos e gastos de órgãos federais.', 'assets/img/cat-politica.svg', 300),
                n('economia', 'Mercado financeiro reage às novas projeções fiscais', 'Bolsa e câmbio oscilam após divulgação do relatório bimestral.', 'assets/img/cat-economia.svg', 360),
                n('investigacao', 'Exclusivo JB: documentos revelam falhas em contratos de infraestrutura', 'Análise de aditivos contratuais aponta reajustes acima da média de mercado.', 'assets/img/obras-publicas.jpg', 420),
                n('tecnologia', 'Plataformas digitais terão de ampliar transparência sobre moderação de conteúdo', 'Debate sobre regras para redes sociais avança entre especialistas e legisladores.', 'assets/img/redes-sociais.jpg', 500),
                n('esportes', 'Clubes discutem regras de equilíbrio financeiro para a próxima temporada', 'Proposta prevê limites de endividamento e relatórios públicos.', 'assets/img/cat-esportes.svg', 600),
                n('brasil', 'Estados ampliam cooperação para monitorar obras de grande porte', 'Consórcio regional pretende unificar dados de acompanhamento.', 'assets/img/cat-brasil.svg', 700),
                n('mundo', 'Cúpula internacional discute metas comuns de transparência fiscal', 'Países-membros avaliam padrões de divulgação de contas públicas.', 'assets/img/cat-mundo.svg', 800),
                n('educacao', 'Rede pública testa novo modelo de acompanhamento da frequência escolar', 'Painel reúne dados de presença para identificar risco de evasão.', 'assets/img/cat-educacao.svg', 900),
                n('saude', 'Municípios divulgam painel de tempo de espera em unidades básicas', 'Indicadores ajudam a planejar a distribuição de equipes.', 'assets/img/cat-saude.svg', 1000),
                n('meioambiente', 'Relatório aponta avanço de programas de recuperação de áreas degradadas', 'Dados fictícios de demonstração indicam aumento da área monitorada.', 'assets/img/cat-meioambiente.svg', 1100),
                n('cultura', 'Festival regional anuncia programação gratuita de cinema e música', 'Evento ocupará espaços públicos durante o fim de semana.', 'assets/img/cat-cultura.svg', 1200)
            ]);
        }
        if (store.get(KEYS.users) === null) {
            // Conta de editor para demonstração (simulada)
            write(KEYS.users, [{ id: 'admin', name: 'Editor JB', email: 'admin@jb.com.br', pass: hash('admin@jb.com.briadmin123'), role: 'admin', bio: '', city: '', interests: [], created: new Date().toISOString() }]);
        }
        if (store.get(KEYS.reports) === null) write(KEYS.reports, []);
    }

    /* ---------- Notícias ---------- */
    const News = {
        everything() { return read(KEYS.news, []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)); },   // painel: todos os status
        all() { return News.everything().filter(isPublished); },                                                      // leitores: só publicadas
        get(id) { return read(KEYS.news, []).find(x => x.id === id) || null; },
        save(item) {
            const list = read(KEYS.news, []);
            const i = list.findIndex(x => x.id === item.id);
            if (i >= 0) list[i] = Object.assign(list[i], item); else { item.id = uid(); item.date = item.date || new Date().toISOString(); list.push(item); }
            write(KEYS.news, list);
            return item;
        },
        remove(id) { write(KEYS.news, read(KEYS.news, []).filter(x => x.id !== id)); },
        byCategory(cat) { return News.all().filter(x => x.category === cat); },
        search(q) {
            q = q.toLowerCase();
            return News.all().filter(x => (x.title + ' ' + x.subtitle + ' ' + x.author + ' ' + x.body.join(' ')).toLowerCase().includes(q));
        }
    };

    /* ---------- Usuários e sessão ---------- */
    const Auth = {
        users() { return read(KEYS.users, []); },
        current() { const id = read(KEYS.session, null); return id ? Auth.users().find(u => u.id === id) || null : null; },
        isAdmin() { const u = Auth.current(); return !!u && u.role === 'admin'; },
        register({ name, email, password }) {
            email = email.trim().toLowerCase();
            const users = Auth.users();
            if (users.some(u => u.email === email)) return { ok: false, error: 'Já existe uma conta com este e-mail.' };
            const user = { id: uid(), name: name.trim(), email, pass: hash(email + 'i' + password), role: 'leitor', bio: '', city: '', interests: [], created: new Date().toISOString() };
            users.push(user); write(KEYS.users, users); write(KEYS.session, user.id);
            return { ok: true, user };
        },
        login(email, password) {
            email = email.trim().toLowerCase();
            const user = Auth.users().find(u => u.email === email && u.pass === hash(email + 'i' + password));
            if (!user) return { ok: false, error: 'E-mail ou senha incorretos.' };
            write(KEYS.session, user.id);
            return { ok: true, user };
        },
        logout() { store.del(KEYS.session); },
        update(patch) {
            const users = Auth.users(); const me = Auth.current();
            if (!me) return null;
            const i = users.findIndex(u => u.id === me.id);
            users[i] = Object.assign(users[i], patch);
            write(KEYS.users, users);
            return users[i];
        },
        changePassword(current, next) {
            const me = Auth.current();
            if (!me || me.pass !== hash(me.email + 'i' + current)) return false;
            Auth.update({ pass: hash(me.email + 'i' + next) });
            return true;
        },
        deleteAccount() {
            const me = Auth.current(); if (!me) return;
            write(KEYS.users, Auth.users().filter(u => u.id !== me.id));
            Auth.logout();
        }
    };

    /* ---------- Denúncias / pautas ---------- */
    const Reports = {
        all() { return read(KEYS.reports, []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)); },
        add(r) { const list = read(KEYS.reports, []); r.id = uid(); r.date = new Date().toISOString(); list.push(r); write(KEYS.reports, list); return r; },
        remove(id) { write(KEYS.reports, read(KEYS.reports, []).filter(r => r.id !== id)); }
    };

    /* ---------- Visualizações (ranking "Mais lidas") ---------- */
    const Views = {
        hit(id) { const v = read(KEYS.views, {}); v[id] = (v[id] || 0) + 1; write(KEYS.views, v); },
        count(id) { return read(KEYS.views, {})[id] || 0; },
        top(n) {
            const v = read(KEYS.views, {});
            return News.all().filter(x => v[x.id]).sort((a, b) => v[b.id] - v[a.id]).slice(0, n);
        }
    };
    const readingTime = n => Math.max(1, Math.round(n.body.join(' ').split(/\s+/).length / 200));

    /* ---------- Favoritos, histórico, comentários, newsletter e tema ---------- */
    const Favs = {
        all() { return read(KEYS.favs, []).map(News.get).filter(n => n && isPublished(n)); },
        has(id) { return read(KEYS.favs, []).includes(id); },
        toggle(id) { let l = read(KEYS.favs, []); const had = l.includes(id); l = had ? l.filter(x => x !== id) : [id].concat(l); write(KEYS.favs, l); return !had; }
    };
    const History = {
        all() { return read(KEYS.history, []).map(News.get).filter(n => n && isPublished(n)); },
        add(id) { write(KEYS.history, [id].concat(read(KEYS.history, []).filter(x => x !== id)).slice(0, 30)); },
        clear() { write(KEYS.history, []); }
    };
    const Comments = {
        forNews(id) { return (read(KEYS.comments, {})[id] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)); },
        add(id, c) { const all = read(KEYS.comments, {}); (all[id] = all[id] || []).push({ id: uid(), name: c.name, text: c.text, date: new Date().toISOString() }); write(KEYS.comments, all); },
        remove(newsId, cid) { const all = read(KEYS.comments, {}); all[newsId] = (all[newsId] || []).filter(c => c.id !== cid); write(KEYS.comments, all); },
        flat() { const all = read(KEYS.comments, {}); return Object.keys(all).flatMap(id => all[id].map(c => Object.assign({ newsId: id }, c))).sort((a, b) => new Date(b.date) - new Date(a.date)); }
    };
    const Newsletter = {
        count() { return read(KEYS.newsletter, []).length; },
        add(email) { email = email.trim().toLowerCase(); const l = read(KEYS.newsletter, []); if (l.includes(email)) return false; l.push(email); write(KEYS.newsletter, l); return true; }
    };
    const Theme = {
        get() { return store.get(KEYS.theme) === 'dark' ? 'dark' : 'light'; },
        set(t) { store.set(KEYS.theme, t); if (t === 'dark') document.documentElement.setAttribute('data-bs-theme', 'dark'); else document.documentElement.removeAttribute('data-bs-theme'); },
        toggle() { Theme.set(Theme.get() === 'dark' ? 'light' : 'dark'); return Theme.get(); }
    };

    /* ---------- Cookies (LGPD) ---------- */
    const Cookies = {
        get() { return read(KEYS.cookies, null); },
        set(prefs) { write(KEYS.cookies, Object.assign({ essential: true, analytics: false, date: new Date().toISOString() }, prefs)); }
    };

    /* ---------- Utilitários ---------- */
    const root = () => document.body.dataset.root || '';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const imgSrc = n => { const src = n.image || FALLBACK_IMG[n.category] || ''; return /^(https?:|data:)/.test(src) ? src : root() + src; };
    function timeAgo(iso) {
        const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
        if (m < 60) return 'Há ' + m + ' min';
        const h = Math.round(m / 60); if (h < 24) return 'Há ' + h + (h === 1 ? ' hora' : ' horas');
        const d = Math.round(h / 24); return 'Há ' + d + (d === 1 ? ' dia' : ' dias');
    }
    const fmtDate = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
    const articleUrl = n => root() + 'pages/noticia.html?id=' + encodeURIComponent(n.id);
    const catLabel = c => (CATEGORIES[c] ? CATEGORIES[c].label : c);
    const catUrl = c => root() + (CATEGORIES[c] ? CATEGORIES[c].page : 'pages/noticias.html');

    // Avatar do usuário: foto (data URL) ou inicial do nome sobre fundo carmim
    const avatarHTML = (u, cls) => '<span class="avatar ' + (cls || '') + '" data-avatar>' +
        (u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : esc((u.name || '?').trim().charAt(0).toUpperCase())) + '</span>';

    function newsCard(n) {
        return '<article class="news-card">' +
            '<img class="card-thumb" loading="lazy" src="' + esc(imgSrc(n)) + '" alt="' + esc(n.title) + '">' +
            '<a class="category-tag" href="' + esc(catUrl(n.category)) + '">' + esc(catLabel(n.category)) + '</a>' +
            '<h3><a href="' + esc(articleUrl(n)) + '">' + esc(n.title) + '</a></h3>' +
            '<p>' + esc(n.subtitle) + '</p><span class="time">' + timeAgo(n.date) + '</span></article>';
    }

    seed();
    window.JB = { storageOk: () => storageOk, KEYS, CATEGORIES, IMAGES, STATUS, STATUS_FLOW, News, Auth, Reports, Cookies, Views, Favs, History, Comments, Newsletter, Theme, util: { isPublished, avatarHTML, readingTime, root, esc, imgSrc, timeAgo, fmtDate, articleUrl, catLabel, catUrl, newsCard } };
})();
