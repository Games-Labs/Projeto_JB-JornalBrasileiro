/* =========================================================
   JB — Elementos compartilhados: ticker, cabeçalho, rodapé e cookies.
   Cada página HTML tem <div id="site-top"> e <div id="site-bottom">.
   Usa <body data-root="" | "../"> e <body data-page="..."> para o menu ativo.

   Cabeçalho, rodapé e cookies são montados NA HORA (não dependem do banco). Só duas partes
   esperam dados: a área do usuário (JB.authReady) e o ticker (JB.ready). Assim, uma falha ou
   lentidão do Supabase nunca deixa a página sem navegação.
   ========================================================= */
(function () {
    'use strict';
    const { Auth, News, Cookies, Theme, A11y, Newsletter, CATEGORIES, util } = JB;
    const { esc, root } = util;
    const R = root();
    const page = document.body.dataset.page || '';

    /* ---------- Ticker ---------- */
    function tickerTrack(state) {
        const list = state === 'ok' ? News.all() : [];
        const live = list.filter(n => n.kind === 'aovivo' && n.live);   // coberturas ao vivo primeiro
        const items = live.concat(list.filter(n => !live.includes(n))).slice(0, 8).map(n => '<a href="' + esc(util.articleUrl(n)) + '">' + (live.includes(n) ? '<strong class="ticker-live">AO VIVO</strong> ' : '') + esc(n.title) + '</a>');
        const empty = state === 'loading' ? 'Carregando as últimas notícias…' : state === 'error' ? 'Não foi possível carregar as últimas notícias agora.' : 'Sem notícias no momento.';
        if (!items.length) return '<span class="ticker-group ticker-static">' + empty + '</span>';
        // O trilho repete o conteúdo duas vezes: a animação anda -50% e recomeça sem "salto".
        const group = '<span class="ticker-group">' + items.join('<span class="ticker-sep">•</span>') + '<span class="ticker-sep">•</span></span>';
        return group + group;
    }
    function ticker() {
        return '<div class="breaking-news-bar" aria-label="Últimas notícias">' +
            '<span class="badge-urgente">EM CIMA DA HORA</span>' +
            '<div class="ticker-wrapper"><div class="ticker-track is-static" id="tickerTrack">' + tickerTrack('loading') + '</div></div></div>';
    }
    function fillTicker() {
        const track = document.getElementById('tickerTrack');
        const state = JB.loadError ? 'error' : 'ok';
        track.innerHTML = tickerTrack(state);
        track.style.animationDuration = Math.max(30, Math.min(8, News.all().length) * 9) + 's';
        track.classList.toggle('is-static', !track.querySelector('a'));
    }

    /* ---------- Cabeçalho ---------- */
    function userArea() {
        const u = Auth.current();
        if (!u) return '<a href="' + R + 'pages/login.html" class="btn btn-user btn-sm px-3">Entrar</a>';
        const item = (href, ic, label) => '<li><a class="dropdown-item" href="' + href + '">' + icon(ic) + '<span>' + label + '</span></a></li>';
        return '<div class="dropdown"><button class="btn btn-user btn-sm ps-1 pe-3 d-flex align-items-center gap-2 dropdown-toggle" data-bs-toggle="dropdown" data-bs-display="static" aria-expanded="false" aria-label="Menu do usuário">' + util.avatarHTML(u, 'avatar-sm') + '<span>' + esc(u.name.split(' ')[0]) + '</span></button>' +
            '<ul class="dropdown-menu dropdown-menu-end user-menu">' +
            '<li class="user-menu-head">' + util.avatarHTML(u, 'avatar-md') + '<div><strong class="user-menu-name">' + esc(u.name) + '</strong><span class="user-menu-role">' + esc(JB.ROLES[u.role] || 'Leitor') + '</span></div></li>' +
            item(R + 'pages/central.html', 'central', 'Minha Central') +
            item(R + 'pages/perfil.html', 'perfil', 'Minhas Informações') +
            item(esc(util.profileUrl(u.id)), 'publico', 'Meu perfil público') +
            (JB.mode === 'supabase' ? item(R + 'pages/seguranca.html', 'seguranca', 'Segurança da conta') : '') +
            (util.isStaffRole(u.role) ? item(R + 'pages/admin.html', 'painel', 'Painel Administrativo') : '') +
            '<li><hr class="dropdown-divider"></li><li><button class="dropdown-item user-menu-out" id="jb-logout">' + icon('sair') + '<span>Sair</span></button></li></ul></div>';
    }

    function header() {
        const link = (id, href, label, cls) => '<li class="nav-item"><a class="nav-link ' + (cls || '') + (page === id ? ' active' : '') + '" href="' + R + href + '">' + label + '</a></li>';
        // --i: atraso da animação de entrada de cada item (um depois do outro)
        const d = i => ' style="--i:' + i + '"', nS = SECTIONS.length, nC = Object.keys(CATEGORIES).length;
        const here = (location.pathname.split('/').pop() || 'index.html') + location.search;
        const cur = href => href === here ? ' aria-current="page"' : '';
        const sections = SECTIONS.map((s, i) => '<li class="drawer-anim"' + d(i + 1) + '><a href="' + R + s[0] + '"' + cur(s[0].replace('pages/', '')) + '>' + icon(s[2]) + '<span>' + s[1] + '</span>' +
            '<svg class="drawer-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a></li>').join('');
        const topics = Object.keys(CATEGORIES).map((k, i) => '<li class="drawer-anim"' + d(nS + 2 + i) + '><a class="cat-' + k + '" href="' + R + CATEGORIES[k].page + '"' + cur(CATEGORIES[k].page.replace('pages/', '')) + '>' + esc(CATEGORIES[k].label) + '</a></li>').join('');
        return '<a class="skip-link" href="#conteudo">Pular para o conteúdo</a><header class="site-header sticky-top"><nav class="navbar navbar-expand-xxl"><div class="container-fluid px-3 px-xxl-4">' +
            '<button class="hamburger-btn me-3" type="button" data-bs-toggle="offcanvas" data-bs-target="#topicsDrawer" aria-controls="topicsDrawer" aria-label="Abrir editorias"><span></span><span></span><span></span></button>' +
            '<a href="' + R + 'index.html" class="logo navbar-brand me-auto"><span class="logo-sigla">JB</span><div class="logo-texto"><strong>Jornal Brasileiro</strong><small>Investigação &amp; Fatos</small></div></a>' +
            '<button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Alternar menu"><span class="navbar-toggler-icon"></span></button>' +
            '<div class="collapse navbar-collapse" id="mainNav"><ul class="navbar-nav mx-xxl-auto align-items-xxl-center">' +
            link('inicio', 'index.html', 'Início') + link('noticias', 'pages/noticias.html', 'Notícias') + link('politica', 'pages/politica.html', 'Política') +
            link('economia', 'pages/economia.html', 'Economia') + link('esportes', 'pages/esportes.html', 'Esportes') +
            link('institucional', 'pages/institucional.html', 'Institucional') + link('denuncias', 'pages/denuncias.html', 'Denuncie / Envie uma Pauta', 'nav-highlight') +
            '</ul><div class="d-flex flex-column flex-xxl-row align-items-xxl-center gap-2">' +
            '<form class="search-box" action="' + R + 'pages/noticias.html" method="get" role="search"><input type="search" name="q" placeholder="Buscar no JB..." aria-label="Buscar notícias"><button type="submit">Buscar</button></form>' +
            '<button type="button" class="theme-toggle" id="themeToggle" aria-label="Alternar entre tema claro e escuro" title="Alternar tema">' +
            '<svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>' +
            '<svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg></button>' +
            '<div id="userArea" class="user-area"><span class="user-slot" aria-hidden="true"></span></div>' + '</div></div></div></nav></header>' +
            '<div class="offcanvas offcanvas-start jb-drawer" tabindex="-1" id="topicsDrawer" aria-labelledby="topicsLabel"><div class="offcanvas-header">' +
            '<div class="drawer-brand"><span class="logo-sigla" aria-hidden="true">JB</span><div><h5 class="offcanvas-title" id="topicsLabel">Seções e editorias</h5><small>Jornal Brasileiro</small></div></div>' +
            '<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fechar"></button></div><div class="offcanvas-body">' +
            '<h6 class="drawer-heading drawer-anim"' + d(0) + '>Seções</h6><ul class="drawer-links">' + sections + '</ul>' +
            '<h6 class="drawer-heading drawer-anim"' + d(nS + 1) + '>Editorias</h6><ul class="drawer-cats">' + topics + '</ul>' +
            '<a class="drawer-cta drawer-anim"' + d(nS + nC + 2) + ' href="' + R + 'pages/central.html">' + icon('central') + '<span><strong>Minha Central</strong><small>Favoritos, histórico e preferências</small></span></a>' +
            '<div class="drawer-a11y drawer-anim"' + d(nS + nC + 3) + '><h6 class="drawer-heading">Acessibilidade</h6>' + a11yControls() + '</div></div></div>';
    }

    /* ---------- Seções do portal (menu lateral e rodapé) ---------- */
    const SECTIONS = [
        ['pages/ao-vivo.html', 'Ao vivo', 'aovivo'], ['pages/investigacao.html', 'Central de Investigações', 'investigacao'], ['pages/verificacao.html', 'Verificação de fatos', 'verificacao'],
        ['pages/opiniao.html', 'Opinião e análise', 'opiniao'], ['pages/entrevistas.html', 'Entrevistas', 'entrevistas'], ['pages/arquivo.html', 'Arquivo', 'arquivo'], ['pages/autor.html', 'Equipe e colunistas', 'equipe']
    ];
    // Ícones dos menus (SVG no próprio código, traço herda a cor do texto)
    const ICONS = {
        aovivo: '<circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
        investigacao: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
        verificacao: '<path d="M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
        opiniao: '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z"/>',
        entrevistas: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
        arquivo: '<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"/>',
        equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
        central: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
        perfil: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.3"/><path d="M5.8 16.5a3.4 3.4 0 0 1 6.4 0M15 10h3M15 13.5h3"/>',
        publico: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
        seguranca: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
        painel: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
        sair: '<path d="M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14M9.5 16.5 5 12l4.5-4.5M5 12h10.5"/>'
    };
    const icon = k => '<svg class="menu-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[k] + '</svg>';

    /* ---------- Acessibilidade: tamanho do texto e alto contraste ---------- */
    function a11yControls() {
        return '<div class="a11y-controls" role="group" aria-label="Acessibilidade">' +
            '<button type="button" class="btn btn-sm btn-outline-dark" data-a11y="font-" aria-label="Diminuir o texto">A−</button>' +
            '<button type="button" class="btn btn-sm btn-outline-dark" data-a11y="font0" aria-label="Texto em tamanho normal">A</button>' +
            '<button type="button" class="btn btn-sm btn-outline-dark" data-a11y="font+" aria-label="Aumentar o texto">A+</button>' +
            '<button type="button" class="btn btn-sm btn-outline-dark" data-a11y="contrast" aria-pressed="false">Alto contraste</button></div>';
    }
    function paintA11y() {
        const a = A11y.get();
        document.querySelectorAll('[data-a11y="contrast"]').forEach(b => { b.setAttribute('aria-pressed', a.contrast); b.classList.toggle('active', a.contrast); });
        document.querySelectorAll('[data-a11y="font-"]').forEach(b => { b.disabled = a.font <= 0; });
        document.querySelectorAll('[data-a11y="font+"]').forEach(b => { b.disabled = a.font >= 3; });
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-a11y]'); if (!b) return;
        const a = A11y.get(), act = b.dataset.a11y;
        if (act === 'font-') A11y.set({ font: a.font - 1 });
        else if (act === 'font+') A11y.set({ font: a.font + 1 });
        else if (act === 'font0') A11y.set({ font: 0 });
        else if (act === 'contrast') A11y.set({ contrast: !a.contrast });
        paintA11y();
    });

    /* ---------- Rodapé ---------- */
    // Perfis oficiais do JB (ícones em SVG no próprio código: a CSP não carrega nada das redes)
    const SOCIAL = [
        ['Instagram', 'https://www.instagram.com/jornalbrasileiro_ofc', '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.3"/>'],
        ['TikTok', 'https://www.tiktok.com/@jornalbrasileiro_ofc', '<path d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>'],
        ['YouTube', 'https://youtube.com/@JornalBrasileiro_OFC', '<path fill-rule="evenodd" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.75 15.02V8.98L15.5 12z"/>']
    ];
    const socialLinks = () => '<ul class="footer-social" aria-label="Redes sociais do JB">' + SOCIAL.map(s =>
        '<li><a href="' + s[1] + '" target="_blank" rel="noopener noreferrer me" aria-label="' + s[0] + ' do JB (abre em nova aba)" title="' + s[0] + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + s[2] + '</svg></a></li>').join('') + '</ul>';
    function footer() {
        return '<footer class="site-footer"><div class="container"><div class="row g-4">' +
            '<div class="col-lg-4 footer-brand"><div class="logo-sigla">JB</div><h3>Jornal Brasileiro</h3><p>Compromisso com o jornalismo independente, investigativo e pautado pelo interesse público.</p>' +
            '<form id="newsletterForm" class="mt-3"><label class="form-label small" for="nlEmail">Newsletter</label><div class="input-group input-group-sm"><input type="email" id="nlEmail" class="form-control" placeholder="seu@email.com" required><button class="btn btn-primary" type="submit">Assinar</button></div><div class="small mt-1" id="nlMsg" role="status"></div></form>' + socialLinks() + '</div>' +
            '<div class="col-6 col-lg-2"><h4>Seções</h4><ul class="footer-links">' + SECTIONS.map(s => '<li><a href="' + R + s[0] + '">' + s[1] + '</a></li>').join('') + '</ul></div>' +
            '<div class="col-6 col-lg-2"><h4>Institucional</h4><ul class="footer-links">' +
            '<li><a href="' + R + 'pages/institucional.html#quem-somos">Quem Somos</a></li><li><a href="' + R + 'pages/institucional.html#expediente">Expediente</a></li><li><a href="' + R + 'pages/institucional.html#contato">Fale com a Redação</a></li>' +
            '<li><a href="' + R + 'pages/central.html">Minha Central</a></li><li><a href="' + R + 'pages/admin.html">Acesso Editorial</a></li></ul></div>' +
            '<div class="col-6 col-lg-2"><h4>Transparência &amp; Legal</h4><ul class="footer-links">' +
            '<li><a href="' + R + 'pages/institucional.html#politica-editorial">Política Editorial</a></li><li><a href="' + R + 'pages/institucional.html#correcoes">Política de Correções</a></li><li><a href="' + R + 'pages/institucional.html#metodologia">Transparência e Metodologia</a></li>' +
            '<li><a href="' + R + 'pages/institucional.html#termos">Termos de Uso</a></li><li><a href="' + R + 'pages/institucional.html#privacidade">Privacidade (LGPD)</a></li>' +
            '<li><button type="button" data-open-cookies>Preferências de Cookies</button></li></ul></div>' +
            '<div class="col-12 col-sm-6 col-lg-2 footer-address"><h4>Redação Central</h4><p>Av. da Imprensa Nacional, 1450 — Sala 802<br>Centro, Brasília - DF<br>CEP 70000-000</p><p><strong>Contato:</strong><br>redacao@jornalbrasileiro.com.br</p></div>' +
            '</div><div class="footer-a11y"><span>Acessibilidade:</span>' + a11yControls() + '</div></div><div class="footer-bottom">' +
            (JB.mode === 'local' ? '<p class="mb-1 local-mode-note"><strong>Modo de demonstração local:</strong> sem conexão com o banco de dados; contas, notícias e denúncias ficam apenas neste navegador e o login é simulado.</p>' : '') +
            '<p class="mb-0">&copy; 2026 Jornal Brasileiro (JB) — Projeto acadêmico sem fins comerciais. Conteúdo fictício. Desenvolvido por GamesYutuber.</p></div></footer>';
    }

    /* ---------- Cookies (LGPD) ---------- */
    function cookieUI() {
        return '<div class="lgpd-banner" id="lgpdBanner" hidden><div class="container d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">' +
            '<p class="mb-0"><strong>Privacidade e Cookies (LGPD):</strong> Utilizamos cookies essenciais para o funcionamento do portal e métricas anônimas de audiência. Leia nossa <a href="' + R + 'pages/institucional.html#privacidade">Política de Privacidade</a>.</p>' +
            '<div class="d-flex flex-wrap gap-2"><button class="btn btn-sm btn-outline-light" data-open-cookies>Gerenciar</button><button class="btn btn-sm btn-light" id="cookiesEssential">Só essenciais</button><button class="btn btn-sm btn-primary" id="cookiesAll">Aceitar todos</button></div></div></div>' +
            '<div class="modal fade" id="cookiesModal" tabindex="-1" aria-labelledby="cookiesTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
            '<div class="modal-header"><h5 class="modal-title" id="cookiesTitle">Preferências de Cookies</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button></div>' +
            '<div class="modal-body"><div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="ckEssential" checked disabled><label class="form-check-label" for="ckEssential"><strong>Essenciais</strong><br><small>Necessários para login, sessão e funcionamento do portal. Sempre ativos.</small></label></div>' +
            '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="ckAnalytics"><label class="form-check-label" for="ckAnalytics"><strong>Métricas de audiência</strong><br><small>Estatísticas anônimas de uso (simulado neste projeto).</small></label></div></div>' +
            '<div class="modal-footer"><button class="btn btn-outline-dark" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" id="cookiesSave">Salvar preferências</button></div></div></div></div>';
    }

    function initCookies() {
        const banner = document.getElementById('lgpdBanner');
        const modalEl = document.getElementById('cookiesModal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        // Enquanto o aviso está aberto, reserva espaço no fim da página para ele não cobrir o conteúdo (importante no celular)
        const pad = () => { document.body.style.paddingBottom = banner.hidden ? '' : banner.offsetHeight + 'px'; };
        const save = prefs => { Cookies.set(prefs); banner.hidden = true; pad(); modal.hide(); };
        if (!Cookies.get()) { banner.hidden = false; pad(); window.addEventListener('resize', pad); }
        document.getElementById('cookiesAll').onclick = () => save({ analytics: true });
        document.getElementById('cookiesEssential').onclick = () => save({ analytics: false });
        document.getElementById('cookiesSave').onclick = () => save({ analytics: document.getElementById('ckAnalytics').checked });
        document.querySelectorAll('[data-open-cookies]').forEach(b => b.addEventListener('click', () => {
            const p = Cookies.get(); document.getElementById('ckAnalytics').checked = !!(p && p.analytics); modal.show();
        }));
    }

    /* ---------- Montagem (imediata) ---------- */
    document.getElementById('site-top').innerHTML = ticker() + header();
    document.getElementById('site-bottom').innerHTML = footer() + cookieUI();
    // Alvo do link "Pular para o conteúdo"
    const main = document.querySelector('main');
    if (main && !main.id) { main.id = 'conteudo'; main.tabIndex = -1; }
    paintA11y();
    JB.ui = { paintA11y };   // páginas que desenham botões de acessibilidade depois chamam de novo
    initCookies();
    document.getElementById('themeToggle').addEventListener('click', () => Theme.toggle());
    document.getElementById('newsletterForm').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target, msg = document.getElementById('nlMsg'), btn = form.querySelector('button');
        btn.disabled = true; msg.textContent = 'Enviando…';
        const r = await Newsletter.add(document.getElementById('nlEmail').value);   // true = inscrito, false = já inscrito (modo local), null = erro
        btn.disabled = false;
        msg.textContent = r === null ? 'Não foi possível registrar agora. Tente novamente.' : r ? (JB.mode === 'local' ? 'Inscrição registrada (demonstração local).' : 'Pronto! Este e-mail está inscrito na newsletter.') : 'Este e-mail já está inscrito.';
        if (r !== null) form.reset();
    });
    // Botões "Tentar de novo" dos estados de erro (util.errorHTML)
    document.addEventListener('click', e => { if (e.target.closest('[data-jb-reload]')) location.reload(); });
    // Vídeo do YouTube (util.videoHTML): o player só é carregado quando o leitor clica.
    document.addEventListener('click', e => {
        const btn = e.target.closest('.jb-video-play'); if (!btn) return;
        const fig = btn.closest('[data-video-embed]'), src = fig && fig.dataset.videoEmbed;
        if (!src || !/^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w?=&-]+$/.test(src)) return;
        const f = document.createElement('iframe');
        f.src = src; f.title = fig.dataset.videoTitle || 'Vídeo do YouTube';
        f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin';
        btn.replaceWith(f); f.focus();
    });

    /* ---------- Conta ainda não liberada (idade ou verificação em duas etapas) ---------- */
    // Aviso no topo de todas as páginas até a pessoa concluir o passo em seguranca.html.
    function accountNotice() {
        const u = Auth.current();
        if (!u || Auth.accountOk() || page === 'seguranca' || !main) return;
        const st = Auth.mfaState();
        const text = !Auth.ageOk() ? 'Confirme sua idade para comentar, salvar favoritos e editar o perfil.'
            : st === 'challenge' ? 'Digite o código do app autenticador para terminar de entrar na sua conta.'
            : 'A equipe do JB precisa ativar a verificação em duas etapas para usar o painel e as funções da redação.';
        const here = (location.pathname.split('/').pop() || '');
        const nx = /^[\w-]+\.html$/.test(here) && here !== 'index.html' ? '?next=' + encodeURIComponent(here) : '';
        const box = document.createElement('div');
        box.className = 'alert alert-warning account-notice d-flex flex-wrap align-items-center justify-content-between gap-2';
        box.setAttribute('role', 'status');
        box.innerHTML = '<span>' + esc(text) + '</span><a class="btn btn-sm btn-dark" href="' + R + 'pages/seguranca.html' + nx + '">Continuar</a>';
        main.prepend(box);
    }

    /* ---------- Partes que dependem de dados ---------- */
    JB.authReady.then(() => {
        document.getElementById('userArea').innerHTML = userArea();
        accountNotice();
        const out = document.getElementById('jb-logout');
        if (out) out.addEventListener('click', async () => { out.disabled = true; await Auth.logout(); location.href = R + 'index.html'; });
    });
    JB.ready.then(fillTicker);

    /* ---------- PWA: instalar como app e ler offline o que já foi aberto (sw.js na raiz) ---------- */
    // Só em http(s) (file:// não aceita service worker) e só no site real (o modo local fica como está)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && JB.mode === 'supabase') {
        window.addEventListener('load', () => { navigator.serviceWorker.register(R + 'sw.js').catch(e => console.warn('Service worker não registrado', e)); });
    }

    /* App instalado (tela cheia, sem botão de recarregar e às vezes sem "puxar para atualizar"): o sistema
       guarda a página aberta em segundo plano e ela voltava com as notícias de horas atrás. Ao voltar
       depois de AWAY_MS, procura a versão nova do site e recarrega as páginas de leitura, nunca uma
       com texto digitado (comentário, busca, formulário) nem o painel/editor. */
    const READING = ['inicio', 'noticias', 'politica', 'economia', 'esportes', 'investigacao', 'verificacao', 'opiniao', 'entrevistas',
        'aovivo', 'arquivo', 'autor', 'perfil-publico', 'institucional', 'central'];
    const AWAY_MS = 5 * 60 * 1000;
    const installed = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    const typed = () => Array.prototype.some.call(document.querySelectorAll('input, textarea, select'), f =>
        f.type === 'hidden' ? false : f.type === 'checkbox' || f.type === 'radio' ? f.checked !== f.defaultChecked
            : f.tagName === 'SELECT' ? Array.prototype.some.call(f.options, o => o.selected !== o.defaultSelected) : f.value !== f.defaultValue);
    let hiddenAt = 0, reloading = false;
    function resumed() {
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        if (reloading || away < AWAY_MS) return;
        if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => { });
        if (installed() && READING.includes(page) && !typed() && navigator.onLine !== false) { reloading = true; location.reload(); }
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = hiddenAt || Date.now(); else resumed(); });
    window.addEventListener('pagehide', () => { hiddenAt = hiddenAt || Date.now(); });
    window.addEventListener('pageshow', e => { if (e.persisted) resumed(); });   // página restaurada do histórico (bfcache)
})();
