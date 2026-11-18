/* =========================================================
   JB — Elementos compartilhados: ticker, cabeçalho, rodapé e cookies.
   Cada página HTML tem <div id="site-top"> e <div id="site-bottom">.
   Usa <body data-root="" | "../"> e <body data-page="..."> para o menu ativo.
   ========================================================= */
(function () {
    'use strict';
    const { Auth, News, Cookies, Theme, Newsletter, CATEGORIES, util } = JB;
    const { esc, root } = util;
    const R = root();
    const page = document.body.dataset.page || '';

    /* ---------- Ticker ---------- */
    function ticker() {
        const items = News.all().slice(0, 8).map(n => '<a href="' + esc(util.articleUrl(n)) + '">' + esc(n.title) + '</a>');
        // O trilho repete o conteúdo duas vezes: a animação anda -50% e recomeça sem "salto".
        const group = '<span class="ticker-group">' + (items.length ? items.join('<span class="ticker-sep">•</span>') + '<span class="ticker-sep">•</span>' : 'Sem notícias no momento.') + '</span>';
        const secs = Math.max(30, items.length * 9);
        return '<div class="breaking-news-bar" aria-label="Últimas notícias">' +
            '<span class="badge-urgente">EM CIMA DA HORA</span>' +
            '<div class="ticker-wrapper"><div class="ticker-track" style="animation-duration:' + secs + 's">' + group + group + '</div></div></div>';
    }

    /* ---------- Cabeçalho ---------- */
    function userArea() {
        const u = Auth.current();
        if (!u) return '<a href="' + R + 'pages/login.html" class="btn btn-user btn-sm px-3">Entrar</a>';
        return '<div class="dropdown"><button class="btn btn-user btn-sm ps-1 pe-3 d-flex align-items-center gap-2 dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Menu do usuário">' + util.avatarHTML(u, 'avatar-sm') + '<span>' + esc(u.name.split(' ')[0]) + '</span></button>' +
            '<ul class="dropdown-menu dropdown-menu-end">' +
            '<li><a class="dropdown-item" href="' + R + 'pages/central.html">Minha Central</a></li>' +
            '<li><a class="dropdown-item" href="' + R + 'pages/perfil.html">Minhas Informações</a></li>' +
            (u.role === 'admin' ? '<li><a class="dropdown-item" href="' + R + 'pages/admin.html">Painel Administrativo</a></li>' : '') +
            '<li><hr class="dropdown-divider"></li><li><button class="dropdown-item" id="jb-logout">Sair</button></li></ul></div>';
    }

    function header() {
        const link = (id, href, label, cls) => '<li class="nav-item"><a class="nav-link ' + (cls || '') + (page === id ? ' active' : '') + '" href="' + R + href + '">' + label + '</a></li>';
        const topics = Object.keys(CATEGORIES).map(k => '<li><a href="' + R + CATEGORIES[k].page + '">' + esc(CATEGORIES[k].label) + '</a></li>').join('');
        return '<header class="site-header sticky-top"><nav class="navbar navbar-expand-xxl"><div class="container-fluid px-3 px-xxl-4">' +
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
            userArea() + '</div></div></div></nav></header>' +
            '<div class="offcanvas offcanvas-start" tabindex="-1" id="topicsDrawer" aria-labelledby="topicsLabel"><div class="offcanvas-header border-bottom"><h5 class="offcanvas-title" id="topicsLabel">Editorias</h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fechar"></button></div><div class="offcanvas-body"><ul class="topics-list">' + topics + '<li><a href="' + R + 'pages/central.html"><strong>Minha Central</strong></a></li></ul></div></div>';
    }

    /* ---------- Rodapé ---------- */
    function footer() {
        return '<footer class="site-footer"><div class="container"><div class="row g-4">' +
            '<div class="col-lg-4 footer-brand"><div class="logo-sigla">JB</div><h3>Jornal Brasileiro</h3><p>Compromisso com o jornalismo independente, investigativo e pautado pelo interesse público.</p>' +
            '<form id="newsletterForm" class="mt-3"><label class="form-label small" for="nlEmail">Newsletter (demonstração)</label><div class="input-group input-group-sm"><input type="email" id="nlEmail" class="form-control" placeholder="seu@email.com" required><button class="btn btn-primary" type="submit">Assinar</button></div><div class="small mt-1" id="nlMsg" role="status"></div></form></div>' +
            '<div class="col-6 col-lg-2"><h4>Institucional</h4><ul class="footer-links">' +
            '<li><a href="' + R + 'pages/institucional.html#quem-somos">Quem Somos</a></li><li><a href="' + R + 'pages/institucional.html#expediente">Expediente</a></li><li><a href="' + R + 'pages/institucional.html#contato">Fale com a Redação</a></li>' +
            '<li><a href="' + R + 'pages/central.html">Minha Central</a></li><li><a href="' + R + 'pages/admin.html">Acesso Editorial</a></li></ul></div>' +
            '<div class="col-6 col-lg-3"><h4>Transparência &amp; Legal</h4><ul class="footer-links">' +
            '<li><a href="' + R + 'pages/institucional.html#termos">Termos de Uso</a></li><li><a href="' + R + 'pages/institucional.html#privacidade">Política de Privacidade (LGPD)</a></li>' +
            '<li><button type="button" data-open-cookies>Preferências de Cookies</button></li></ul></div>' +
            '<div class="col-lg-3 footer-address"><h4>Redação Central</h4><p>Av. da Imprensa Nacional, 1450 — Sala 802<br>Centro, Brasília - DF • CEP 70000-000</p><p><strong>Contato:</strong> redacao@jornalbrasileiro.com.br</p></div>' +
            '</div></div><div class="footer-bottom"><p class="mb-0">&copy; 2026 Jornal Brasileiro (JB) — Projeto acadêmico sem fins comerciais. Conteúdo fictício. Desenvolvido por GamesYutuber.</p></div></footer>';
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
        const save = prefs => { Cookies.set(prefs); banner.hidden = true; modal.hide(); };
        if (!Cookies.get()) banner.hidden = false;
        document.getElementById('cookiesAll').onclick = () => save({ analytics: true });
        document.getElementById('cookiesEssential').onclick = () => save({ analytics: false });
        document.getElementById('cookiesSave').onclick = () => save({ analytics: document.getElementById('ckAnalytics').checked });
        document.querySelectorAll('[data-open-cookies]').forEach(b => b.addEventListener('click', () => {
            const p = Cookies.get(); document.getElementById('ckAnalytics').checked = !!(p && p.analytics); modal.show();
        }));
    }

    /* ---------- Montagem ---------- */
    document.getElementById('site-top').innerHTML = ticker() + header();
    document.getElementById('site-bottom').innerHTML = footer() + cookieUI();
    initCookies();
    document.getElementById('themeToggle').addEventListener('click', () => Theme.toggle());
    document.getElementById('newsletterForm').addEventListener('submit', e => {
        e.preventDefault();
        const msg = document.getElementById('nlMsg');
        msg.textContent = Newsletter.add(document.getElementById('nlEmail').value) ? 'Inscrição registrada (simulada neste navegador).' : 'Este e-mail já está inscrito.';
        e.target.reset();
    });
    const out = document.getElementById('jb-logout');
    if (out) out.addEventListener('click', () => { Auth.logout(); location.href = R + 'index.html'; });
})();
